import {
  assembleChatContext,
  assembleWritingExecuteContext,
  assembleWritingIntentContext,
  blocksFromAssembleChatResult,
  blocksFromWritingIntent,
  chatPersonaForDialect,
  contextSelectionWithServerMarks,
  defaultSelectedBlockIds,
  filterHistoryTurns,
  shouldCompact,
  usesExclusionMode,
  writingChatSystemPromptForDialect,
  writingIntentPromptForDialect,
  writingPersonaForDialect,
  filterWritingMessagesForContext,
  ACTION_PROMPTS,
  WRITING_EXECUTE_OUTPUT_RULES,
  type ContextPreview,
  type ContextSelection,
  type ContextUsage,
  type ReplyDialect,
} from '@shiren/shared';
import type { ChatMessage, ChatSession, Document, WritingAssistantMessage } from '@shiren/shared';
import type { ChatMessageInput } from './deepseek.js';
import { compactHistoryViaLlm, compactDocumentExcerptViaLlm } from './contextCompact.js';
import {
  getChatMessages,
  getChatSession,
  updateChatSessionContext,
  updateDocumentContextFields,
} from '../store/db.js';

const MAX_COMPACT_ROUNDS = 2;

type HistoryTurn = { role: 'user' | 'assistant'; content: string };

export function applyContextSelection<T extends { id?: string; role: string; content: string }>(
  history: T[],
  selection?: ContextSelection | null,
): T[] {
  return filterHistoryTurns(history, selection);
}

function writingBlocksIncluded(
  preview: ContextPreview,
  selection?: ContextSelection | null,
): { chapter: boolean; document: boolean } {
  const chapterBlock = preview.blocks.find((b) => b.kind === 'document_chapter');
  const documentBlock = preview.blocks.find((b) => b.kind === 'document_excerpt');
  if (selection && usesExclusionMode(selection)) {
    const excluded = new Set(selection.excludedBlockIds ?? []);
    return {
      chapter: chapterBlock ? !excluded.has(chapterBlock.id) : true,
      document: documentBlock ? !excluded.has(documentBlock.id) : true,
    };
  }
  const selected = new Set(
    selection?.selectedBlockIds?.length
      ? selection.selectedBlockIds
      : defaultSelectedBlockIds(preview.blocks),
  );
  return {
    chapter: chapterBlock ? selected.has(chapterBlock.id) : true,
    document: documentBlock ? selected.has(documentBlock.id) : true,
  };
}

function chatHistoryAfterAnchor(
  messages: ChatMessage[],
  upToMessageId: string | null | undefined,
): ChatMessage[] {
  if (!upToMessageId) return messages;
  const idx = messages.findIndex((m) => m.id === upToMessageId);
  return idx >= 0 ? messages.slice(idx + 1) : messages;
}

function toTurns(messages: Array<{ role: string; content: string }>): HistoryTurn[] {
  return messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));
}

function writingHistoryAfterAnchor(
  messages: WritingAssistantMessage[],
  upToMessageId: string | null | undefined,
): WritingAssistantMessage[] {
  const filtered = filterWritingMessagesForContext(messages);
  if (!upToMessageId) return filtered;
  const idx = filtered.findIndex((m) => m.id === upToMessageId);
  return idx >= 0 ? filtered.slice(idx + 1) : filtered;
}

export type PreparedChatContext = {
  messages: ChatMessageInput[];
  usage: ContextUsage;
  session: ChatSession;
};

export async function prepareChatContext(params: {
  apiKey: string;
  sessionId: string;
  pendingUser: string;
  dialect?: ReplyDialect;
  contextSelection?: ContextSelection;
}): Promise<PreparedChatContext> {
  const session = getChatSession(params.sessionId);
  if (!session) throw new Error('SESSION_NOT_FOUND');

  const allMessages = getChatMessages(params.sessionId);
  const effectiveSelection = contextSelectionWithServerMarks(
    allMessages,
    params.contextSelection,
  );
  const systemPrompt = chatPersonaForDialect(params.dialect);

  let summary = session.contextSummary ?? null;
  let upToId = session.contextSummaryUpToMessageId ?? null;

  for (let round = 0; round < MAX_COMPACT_ROUNDS; round++) {
    const historyMsgs = applyContextSelection(
      chatHistoryAfterAnchor(allMessages, upToId),
      effectiveSelection,
    );
    const history = toTurns(historyMsgs);
    const assembled = assembleChatContext({
      systemPrompt,
      summary,
      history,
      pendingUser: params.pendingUser,
    });

    if (!assembled.needsCompact && !shouldCompact(assembled.usage)) {
      return {
        messages: assembled.messages as ChatMessageInput[],
        usage: {
          ...assembled.usage,
          compacted: Boolean(summary?.trim()),
        },
        session: getChatSession(params.sessionId)!,
      };
    }

    const omitCount = assembled.messagesToCompact.length;
    if (omitCount === 0) break;

    const toCompact = historyMsgs.slice(0, omitCount);
    const merged = await compactHistoryViaLlm({
      apiKey: params.apiKey,
      messages: toTurns(toCompact),
      existingSummary: summary,
      dialect: params.dialect,
    });
    summary = merged;
    const lastId = toCompact[toCompact.length - 1]?.id ?? upToId;
    upToId = lastId;
    updateChatSessionContext(params.sessionId, summary, lastId);
  }

  const historyMsgs = applyContextSelection(
    chatHistoryAfterAnchor(allMessages, upToId),
    effectiveSelection,
  );
  const assembled = assembleChatContext({
    systemPrompt,
    summary,
    history: toTurns(historyMsgs),
    pendingUser: params.pendingUser,
  });

  return {
    messages: assembled.messages as ChatMessageInput[],
    usage: {
      ...assembled.usage,
      compacted: Boolean(summary?.trim()),
    },
    session: getChatSession(params.sessionId)!,
  };
}

export async function previewChatContextPreview(params: {
  sessionId: string;
  pendingUser?: string;
  dialect?: ReplyDialect;
  contextSelection?: ContextSelection;
}): Promise<ContextPreview> {
  const session = getChatSession(params.sessionId);
  if (!session) throw new Error('SESSION_NOT_FOUND');

  const allMessages = getChatMessages(params.sessionId);
  const effectiveSelection = contextSelectionWithServerMarks(
    allMessages,
    params.contextSelection,
  );
  const historyMsgs = applyContextSelection(
    chatHistoryAfterAnchor(allMessages, session.contextSummaryUpToMessageId),
    effectiveSelection,
  );
  const assembled = assembleChatContext({
    systemPrompt: chatPersonaForDialect(params.dialect),
    summary: session.contextSummary,
    history: toTurns(historyMsgs),
    pendingUser: params.pendingUser?.trim() || '…',
  });
  const preview = blocksFromAssembleChatResult(assembled, {
    historyMessageIds: historyMsgs.map((m) => m.id),
    excludedMessageIds: usesExclusionMode(effectiveSelection)
      ? effectiveSelection!.excludedMessageIds
      : undefined,
  });
  return {
    ...preview,
    usage: {
      ...preview.usage,
      compacted: Boolean(session.contextSummary?.trim()) || assembled.needsCompact,
    },
  };
}

export async function previewChatContextUsage(params: {
  sessionId: string;
  pendingUser?: string;
  dialect?: ReplyDialect;
  contextSelection?: ContextSelection;
}): Promise<ContextUsage> {
  const preview = await previewChatContextPreview(params);
  return preview.usage;
}

export async function compactChatSession(params: {
  apiKey: string;
  sessionId: string;
  dialect?: ReplyDialect;
}): Promise<{ confirmation: string; usage: ContextUsage }> {
  const session = getChatSession(params.sessionId);
  if (!session) throw new Error('SESSION_NOT_FOUND');

  const allMessages = getChatMessages(params.sessionId);
  if (allMessages.length === 0) {
    const usage = await previewChatContextUsage({ sessionId: params.sessionId, dialect: params.dialect });
    return { confirmation: '当前对话还没有可压缩的历史消息。', usage };
  }

  const turns = toTurns(allMessages);
  const summary = await compactHistoryViaLlm({
    apiKey: params.apiKey,
    messages: turns,
    existingSummary: session.contextSummary ?? null,
    dialect: params.dialect,
  });
  const lastId = allMessages[allMessages.length - 1]?.id ?? null;
  updateChatSessionContext(params.sessionId, summary, lastId);

  const usage = await previewChatContextUsage({ sessionId: params.sessionId, dialect: params.dialect });
  return {
    confirmation: '已整理并压缩对话上下文，后续回复会优先参考摘要。',
    usage,
  };
}

export type PreparedWritingIntentContext = {
  messages: ChatMessageInput[];
  usage: ContextUsage;
  document: Document;
};

type PrepareWritingSidebarContextParams = {
  apiKey: string;
  documentId: string;
  document: Document;
  allMessages: WritingAssistantMessage[];
  chapterBlock: string;
  documentBlock: string;
  userMessage: string;
  dialect?: ReplyDialect;
  contextSelection?: ContextSelection;
  systemPrompt?: string;
  referenceScope?: 'chapter' | 'document';
};

async function prepareWritingSidebarContext(
  params: PrepareWritingSidebarContextParams,
): Promise<PreparedWritingIntentContext> {
  const effectiveSelection = contextSelectionWithServerMarks(
    params.allMessages,
    params.contextSelection,
  );
  const systemPrompt =
    params.systemPrompt ?? writingIntentPromptForDialect(params.dialect);
  let summary = params.document.writingContextSummary ?? null;
  let upToId = params.document.writingContextSummaryUpToMessageId ?? null;
  let doc = params.document;
  let documentBlock =
    params.referenceScope === 'chapter' ? '' : params.documentBlock;
  let chapterBlock = params.chapterBlock;

  const draftPreview = blocksFromWritingIntent(
    assembleWritingIntentContext({
      systemPrompt,
      summary,
      history: toTurns(writingHistoryAfterAnchor(params.allMessages, upToId)),
      chapterBlock,
      documentBlock,
      userMessage: params.userMessage,
    }),
    { chapterBlock, documentBlock },
  );
  const included = writingBlocksIncluded(draftPreview, effectiveSelection);
  if (!included.chapter) chapterBlock = '';
  if (!included.document) documentBlock = '';

  for (let round = 0; round < MAX_COMPACT_ROUNDS; round++) {
    const historyMsgs = applyContextSelection(
      writingHistoryAfterAnchor(params.allMessages, upToId),
      effectiveSelection,
    );
    const history = toTurns(historyMsgs);
    const assembled = assembleWritingIntentContext({
      systemPrompt,
      summary,
      history,
      chapterBlock,
      documentBlock,
      userMessage: params.userMessage,
    });

    if (!assembled.needsCompact && !shouldCompact(assembled.usage)) {
      return {
        messages: assembled.messages as ChatMessageInput[],
        usage: {
          ...assembled.usage,
          compacted:
            Boolean(summary?.trim()) || Boolean(doc.documentContextSummary?.trim()),
        },
        document: doc,
      };
    }

    const omitCount = assembled.messagesToCompact.length;
    if (omitCount > 0) {
      const toCompact = historyMsgs.slice(0, omitCount);
      summary = await compactHistoryViaLlm({
        apiKey: params.apiKey,
        messages: toTurns(toCompact),
        existingSummary: summary,
        dialect: params.dialect,
      });
      const lastId = toCompact[toCompact.length - 1]?.id ?? upToId;
      upToId = lastId;
      doc =
        updateDocumentContextFields(params.documentId, {
          writingContextSummary: summary,
          writingContextSummaryUpToMessageId: lastId,
        }) ?? doc;
    } else if (documentBlock.length > 6000 && !doc.documentContextSummary?.trim()) {
      const compactDoc = await compactDocumentExcerptViaLlm({
        apiKey: params.apiKey,
        documentExcerpt: documentBlock,
        dialect: params.dialect,
      });
      doc =
        updateDocumentContextFields(params.documentId, {
          documentContextSummary: compactDoc,
        }) ?? doc;
      documentBlock = `全篇摘要（供理解，勿改其它章）：\n${compactDoc}`;
    } else {
      break;
    }
  }

  const historyMsgs = applyContextSelection(
    writingHistoryAfterAnchor(params.allMessages, upToId),
    effectiveSelection,
  );
  const docBlock =
    doc.documentContextSummary?.trim() &&
    !documentBlock.includes('全篇摘要') &&
    documentBlock.length > 4000
      ? `全篇摘要（供理解，勿改其它章）：\n${doc.documentContextSummary}`
      : documentBlock;

  const assembled = assembleWritingIntentContext({
    systemPrompt,
    summary,
    history: toTurns(historyMsgs),
    chapterBlock,
    documentBlock: docBlock,
    userMessage: params.userMessage,
  });

  return {
    messages: assembled.messages as ChatMessageInput[],
    usage: {
      ...assembled.usage,
      compacted:
        Boolean(summary?.trim()) ||
        Boolean(doc.documentContextSummary?.trim()) ||
        assembled.needsCompact,
    },
    document: doc,
  };
}

export async function prepareWritingIntentContext(
  params: Omit<PrepareWritingSidebarContextParams, 'systemPrompt'>,
): Promise<PreparedWritingIntentContext> {
  return prepareWritingSidebarContext(params);
}

export type PreparedWritingChatContext = PreparedWritingIntentContext;

/** 写作侧栏对话：评价、建议、闲聊（不改正文） */
export async function prepareWritingChatContext(
  params: Omit<PrepareWritingSidebarContextParams, 'systemPrompt'>,
): Promise<PreparedWritingChatContext> {
  return prepareWritingSidebarContext({
    ...params,
    systemPrompt: writingChatSystemPromptForDialect(params.dialect),
  });
}

export async function previewWritingIntentContextPreview(params: {
  document: Document;
  allMessages: WritingAssistantMessage[];
  chapterBlock: string;
  documentBlock: string;
  pendingUser?: string;
  dialect?: ReplyDialect;
  contextSelection?: ContextSelection;
}): Promise<ContextPreview> {
  const effectiveSelection = contextSelectionWithServerMarks(
    params.allMessages,
    params.contextSelection,
  );
  const historyMsgs = applyContextSelection(
    writingHistoryAfterAnchor(
      params.allMessages,
      params.document.writingContextSummaryUpToMessageId,
    ),
    effectiveSelection,
  );
  const docBlock =
    params.document.documentContextSummary?.trim() &&
    params.documentBlock.length > 4000
      ? `全篇摘要：\n${params.document.documentContextSummary}`
      : params.documentBlock;

  const assembled = assembleWritingIntentContext({
    systemPrompt: writingIntentPromptForDialect(params.dialect),
    summary: params.document.writingContextSummary,
    history: toTurns(historyMsgs),
    chapterBlock: params.chapterBlock,
    documentBlock: docBlock,
    userMessage: params.pendingUser?.trim() || '…',
  });

  const preview = blocksFromWritingIntent(assembled, {
    chapterBlock: params.chapterBlock,
    documentBlock: docBlock,
    historyMessageIds: historyMsgs.map((m) => m.id),
    excludedMessageIds: usesExclusionMode(effectiveSelection)
      ? effectiveSelection!.excludedMessageIds
      : undefined,
    excludedBlockIds: usesExclusionMode(effectiveSelection)
      ? effectiveSelection!.excludedBlockIds
      : undefined,
  });

  return {
    ...preview,
    usage: {
      ...preview.usage,
      compacted:
        Boolean(params.document.writingContextSummary?.trim()) || assembled.needsCompact,
    },
  };
}

export async function previewWritingIntentContextUsage(params: {
  document: Document;
  allMessages: WritingAssistantMessage[];
  chapterBlock: string;
  documentBlock: string;
  pendingUser?: string;
  dialect?: ReplyDialect;
  contextSelection?: ContextSelection;
}): Promise<ContextUsage> {
  const preview = await previewWritingIntentContextPreview(params);
  return preview.usage;
}

export function prepareWritingExecuteContext(params: {
  action: string;
  oldText: string;
  instruction?: string;
  styleGuide?: string;
  dialect?: ReplyDialect;
  chapterTitle?: string;
  understandingScope?: 'chapter' | 'document';
  documentExcerpt?: string;
  documentContextSummary?: string | null;
}): { messages: ChatMessageInput[]; usage: ContextUsage } {
  const actionPrompt = ACTION_PROMPTS[params.action] ?? ACTION_PROMPTS['润色'];
  const isContinue = params.action === '续写';
  const useFullDoc = params.understandingScope === 'document';

  const system = `${writingPersonaForDialect(params.dialect)}

${actionPrompt}

要求：
- 每次只能修改「待改本章」的正文；其它章节仅供理解上下文，不得改写或输出其它章节内容。
${useFullDoc ? '' : '- 本次仅根据「待改本章」理解用户要求，不要引用其它章节内容。'}
${isContinue ? '- 只输出需要续写的新增段落，不要重复原文，不要加标题或说明' : '- 只输出修改后的完整段落正文，不要加标题、引号或解释'}
- 不要使用 markdown 格式

${WRITING_EXECUTE_OUTPUT_RULES}`;

  const docPart =
    useFullDoc && params.documentContextSummary?.trim()
      ? `全篇摘要（仅供理解，勿改其它章）：\n${params.documentContextSummary.trim()}`
      : useFullDoc && params.documentExcerpt?.trim()
        ? `全篇节选（仅供理解，勿改其它章）：\n${params.documentExcerpt.trim()}`
        : '';

  const userParts = [
    params.styleGuide ? `写作风格：${params.styleGuide}` : '',
    params.chapterTitle ? `待改本章：${params.chapterTitle}` : '',
    useFullDoc
      ? '理解范围：可参考下方全篇理解上下文，但输出只能替换待改本章正文。'
      : '理解范围：仅根据待改本章正文理解，不要引用其它章节内容来改写。',
    `待改本章正文：\n${params.oldText || '（空）'}`,
    docPart,
    params.instruction ? `用户补充：${params.instruction}` : '',
  ].filter(Boolean);

  const { messages, usage } = assembleWritingExecuteContext({
    systemPrompt: system,
    userParts,
  });

  return { messages: messages as ChatMessageInput[], usage };
}
