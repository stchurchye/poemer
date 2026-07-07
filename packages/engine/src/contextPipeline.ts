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
import { compactHistoryViaLlm, compactDocumentExcerptViaLlm } from './contextCompact.js';
import type { ContextStoreAdapter } from './contextStore.js';
import type { ModelClient, ModelCompletionInput } from './modelClient.js';

export type ChatMessageInput = ModelCompletionInput['messages'][number];

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
  // 修 B3：锚点已设但找不到时，视为锚点前内容已被摘要覆盖，回退为空历史，
  // 绝不回退成「返回全部历史」（那会把已进摘要的内容逐字全量重发、撑爆预算）。
  return idx >= 0 ? messages.slice(idx + 1) : [];
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
  // 修 B3：先在「未过滤的原始序列」里定位锚点（锚点可能正是被 filter 剔除的被拒轮，
  // 若先过滤再找会 idx=-1 → 旧代码回退成全量重发）。定位后再做上下文过滤。
  let afterAnchor = messages;
  if (upToMessageId) {
    const idx = messages.findIndex((m) => m.id === upToMessageId);
    afterAnchor = idx >= 0 ? messages.slice(idx + 1) : [];
  }
  return filterWritingMessagesForContext(afterAnchor);
}

/** 压缩产物：由 prepareChatContext 决定、但只在模型回复成功后由调用方提交（修 A1） */
export type PendingContextCommit = {
  summary: string;
  upToMessageId: string | null;
};

export type PreparedChatContext = {
  messages: ChatMessageInput[];
  usage: ContextUsage;
  session: ChatSession;
  /** 有值表示本轮做了压缩；调用方需在回复+消息成功入库后调用 commitPreparedChatContext */
  pendingContextCommit?: PendingContextCommit;
};

/**
 * 修 A1：把「摘要+锚点落库」从 prepare 阶段挪到回复成功之后。
 * 调用方在 addChatMessage(user+assistant) 成功后调用此函数一次；失败则永不调用，
 * store 保持原样、原话可重发，绝不出现「锚点已推进但本轮原话没入库」的不可逆丢失。
 */
export function commitPreparedChatContext(
  store: ContextStoreAdapter,
  sessionId: string,
  prepared: { pendingContextCommit?: PendingContextCommit },
): void {
  const commit = prepared.pendingContextCommit;
  if (!commit) return;
  store.updateChatSessionContext(sessionId, commit.summary, commit.upToMessageId);
}

/** 预防式压缩：占用达阈值但历史仍装得下时，折叠最老约 1/4 轮（成对，至少 2）来腾空间（修 B2） */
function preventiveFoldCount(historyLen: number): number {
  if (historyLen < 2) return 0;
  const n = Math.max(2, Math.floor(historyLen / 4));
  return Math.min(n, historyLen);
}

export async function prepareChatContext(params: {
  store: ContextStoreAdapter;
  model: ModelClient;
  sessionId: string;
  pendingUser: string;
  dialect?: ReplyDialect;
  contextSelection?: ContextSelection;
  limitTokens?: number;
  outputReserve?: number;
  modelId?: string | null;
}): Promise<PreparedChatContext> {
  const session = params.store.getChatSession(params.sessionId);
  if (!session) throw new Error('SESSION_NOT_FOUND');

  const allMessages = params.store.getChatMessages(params.sessionId);
  const effectiveSelection = contextSelectionWithServerMarks(
    allMessages,
    params.contextSelection,
  );
  const systemPrompt = chatPersonaForDialect(params.dialect);

  let summary = session.contextSummary ?? null;
  let upToId = session.contextSummaryUpToMessageId ?? null;
  let didCompact = false;

  const assembleOpts = {
    limitTokens: params.limitTokens,
    outputReserve: params.outputReserve,
    modelId: params.modelId,
  };

  for (let round = 0; round < MAX_COMPACT_ROUNDS; round++) {
    const rawAfterAnchor = chatHistoryAfterAnchor(allMessages, upToId);
    const historyMsgs = applyContextSelection(rawAfterAnchor, effectiveSelection);
    const assembled = assembleChatContext({
      systemPrompt,
      summary,
      history: toTurns(historyMsgs),
      pendingUser: params.pendingUser,
      ...assembleOpts,
    });

    if (!assembled.needsCompact && !shouldCompact(assembled.usage)) break;

    // 决定折叠多少条最老的（已过滤）历史
    let omitCount = assembled.messagesToCompact.length;
    if (omitCount === 0) {
      // 修 B2：达阈值但没溢出 → 预防式折叠最老一小批，而不是一进循环就 break
      omitCount = preventiveFoldCount(historyMsgs.length);
    }
    if (omitCount === 0) break;

    const filteredToFold = historyMsgs.slice(0, omitCount);
    const lastFoldedId = filteredToFold[filteredToFold.length - 1]?.id;
    if (!lastFoldedId) break;

    // 修 A2：锚点基于「原始序列」推进——折叠 rawAfterAnchor 中到 lastFoldedId 为止的整段前缀
    // （含期间任何被 selection 排除的消息），保证锚点绝不越过未进摘要的消息。
    const rawCut = rawAfterAnchor.findIndex((m) => m.id === lastFoldedId);
    const rawToFold = rawCut >= 0 ? rawAfterAnchor.slice(0, rawCut + 1) : filteredToFold;

    // 压缩 completion 上限保持安全默认（8192），不按回复模型放大——压缩模型可能是
    // flash-lite / DeepSeek，其单次输出上限各异；modelId 只用于组装窗口，不传给压缩。
    summary = await compactHistoryViaLlm({
      model: params.model,
      messages: toTurns(rawToFold),
      existingSummary: summary,
      dialect: params.dialect,
    });
    upToId = rawToFold[rawToFold.length - 1]?.id ?? upToId;
    didCompact = true;
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
    ...assembleOpts,
  });

  return {
    messages: assembled.messages as ChatMessageInput[],
    usage: {
      ...assembled.usage,
      compacted: Boolean(summary?.trim()),
    },
    session: params.store.getChatSession(params.sessionId)!,
    pendingContextCommit: didCompact
      ? { summary: summary ?? '', upToMessageId: upToId }
      : undefined,
  };
}

export async function previewChatContextPreview(params: {
  store: ContextStoreAdapter;
  sessionId: string;
  pendingUser?: string;
  dialect?: ReplyDialect;
  contextSelection?: ContextSelection;
}): Promise<ContextPreview> {
  const session = params.store.getChatSession(params.sessionId);
  if (!session) throw new Error('SESSION_NOT_FOUND');

  const allMessages = params.store.getChatMessages(params.sessionId);
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
  store: ContextStoreAdapter;
  sessionId: string;
  pendingUser?: string;
  dialect?: ReplyDialect;
  contextSelection?: ContextSelection;
}): Promise<ContextUsage> {
  const preview = await previewChatContextPreview(params);
  return preview.usage;
}

export async function compactChatSession(params: {
  store: ContextStoreAdapter;
  model: ModelClient;
  sessionId: string;
  dialect?: ReplyDialect;
}): Promise<{ confirmation: string; usage: ContextUsage }> {
  const session = params.store.getChatSession(params.sessionId);
  if (!session) throw new Error('SESSION_NOT_FOUND');

  const allMessages = params.store.getChatMessages(params.sessionId);
  if (allMessages.length === 0) {
    const usage = await previewChatContextUsage({
      store: params.store,
      sessionId: params.sessionId,
      dialect: params.dialect,
    });
    return { confirmation: '当前对话还没有可压缩的历史消息。', usage };
  }

  // 修 C-Dedup：只折叠锚点之后、尚未进摘要的消息，不把已并入 existingSummary 的旧消息重压一遍
  const afterAnchor = chatHistoryAfterAnchor(
    allMessages,
    session.contextSummaryUpToMessageId,
  );
  const toFold = afterAnchor.length > 0 ? afterAnchor : allMessages;
  const summary = await compactHistoryViaLlm({
    model: params.model,
    messages: toTurns(toFold),
    existingSummary: session.contextSummary ?? null,
    dialect: params.dialect,
  });
  const lastId = toFold[toFold.length - 1]?.id ?? null;
  params.store.updateChatSessionContext(params.sessionId, summary, lastId);

  const usage = await previewChatContextUsage({
    store: params.store,
    sessionId: params.sessionId,
    dialect: params.dialect,
  });
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
  store: ContextStoreAdapter;
  model: ModelClient;
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
        model: params.model,
        messages: toTurns(toCompact),
        existingSummary: summary,
        dialect: params.dialect,
      });
      const lastId = toCompact[toCompact.length - 1]?.id ?? upToId;
      upToId = lastId;
      doc =
        params.store.updateDocumentContextFields(params.documentId, {
          writingContextSummary: summary,
          writingContextSummaryUpToMessageId: lastId,
        }) ?? doc;
    } else if (documentBlock.length > 6000 && !doc.documentContextSummary?.trim()) {
      const compactDoc = await compactDocumentExcerptViaLlm({
        model: params.model,
        documentExcerpt: documentBlock,
        dialect: params.dialect,
      });
      doc =
        params.store.updateDocumentContextFields(params.documentId, {
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
  limitTokens?: number;
  outputReserve?: number;
  modelId?: string | null;
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

  // 修 C2：把用户指令/风格/范围说明放进 pinned 段（永不被截），只在 trimmable 段（正文/全篇节选）里裁
  const pinnedParts = [
    params.styleGuide ? `写作风格：${params.styleGuide}` : '',
    params.chapterTitle ? `待改本章：${params.chapterTitle}` : '',
    useFullDoc
      ? '理解范围：可参考下方全篇理解上下文，但输出只能替换待改本章正文。'
      : '理解范围：仅根据待改本章正文理解，不要引用其它章节内容来改写。',
    params.instruction ? `用户补充：${params.instruction}` : '',
  ].filter(Boolean);

  const trimmableParts = [
    `待改本章正文：\n${params.oldText || '（空）'}`,
    docPart,
  ].filter(Boolean);

  const { messages, usage } = assembleWritingExecuteContext({
    systemPrompt: system,
    pinnedParts,
    trimmableParts,
    limitTokens: params.limitTokens,
    outputReserve: params.outputReserve,
    modelId: params.modelId,
  });

  return { messages: messages as ChatMessageInput[], usage };
}
