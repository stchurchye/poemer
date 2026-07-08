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
  formatStoryBibleForLlm,
  ACTION_PROMPTS,
  WRITING_EXECUTE_OUTPUT_RULES,
  type ContextPreview,
  type ContextSelection,
  type ContextUsage,
  type ReplyDialect,
  type StoryBible,
} from '@shiren/shared';
import type { ChatMessage, ChatSession, Document, WritingAssistantMessage } from '@shiren/shared';
import { compactHistoryViaLlm, compactDocumentExcerptViaLlm } from './contextCompact.js';
import { extractStoryBible } from './storyBibleExtract.js';
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
  // 修 review#6：锚点在原始消息里真的找不到（数据迁移/损坏、跨设备 id 不一致）时，回退为「全部」
  // 而非空——宁可冗余重发已摘要内容，也绝不把活着的对话历史静默丢光。
  // （B3 的写作侧「被 filter 剔除的锚点」问题已由 writingHistoryAfterAnchor 的 raw-first 定位解决，
  //  chat 侧锚点是真实持久消息、正常不会 dangling，此回退仅在异常态触发。）
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
  // 修 B3：先在「未过滤的原始序列」里定位锚点（锚点可能正是被 filter 剔除的被拒轮，
  // 若先过滤再找会 idx=-1 → 旧代码回退成全量重发）。定位后再做上下文过滤。
  let afterAnchor = messages;
  if (upToMessageId) {
    const idx = messages.findIndex((m) => m.id === upToMessageId);
    // 修 review#6：原始序列里真找不到（迁移/损坏）时回退全部而非空，宁可冗余也不静默丢历史
    afterAnchor = idx >= 0 ? messages.slice(idx + 1) : messages;
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
    const merged = await compactHistoryViaLlm({
      model: params.model,
      messages: toTurns(rawToFold),
      existingSummary: summary,
      dialect: params.dialect,
    });
    // 修 review#1（HIGH）：压缩模型返回空/纯空白（弱模型拒答、上游异常返回空而非抛错）时，
    // 绝不推进锚点、绝不提交空摘要——否则被折叠的逐字对话会连同摘要一起消失（重新引入 A1 丢失）。
    // 保留既有 summary/upToId 不动，被挤出的旧轮次留在 store 里，下次请求再试压缩。
    if (!merged.trim()) break;
    summary = merged;
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
  // 修 review#6：锚点已到末尾（无新增未摘要消息）时直接短路，不再回退整段重压（否则把已进摘要的旧消息+旧摘要再压一遍，多花钱且摘要膨胀）
  if (afterAnchor.length === 0) {
    const usage = await previewChatContextUsage({
      store: params.store,
      sessionId: params.sessionId,
      dialect: params.dialect,
    });
    return { confirmation: '对话已整理过，暂无新增可压缩的内容。', usage };
  }
  const summary = await compactHistoryViaLlm({
    model: params.model,
    messages: toTurns(afterAnchor),
    existingSummary: session.contextSummary ?? null,
    dialect: params.dialect,
  });
  const lastId = afterAnchor[afterAnchor.length - 1]?.id ?? null;
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

/** 写作侧压缩产物：与问答侧 A1 同理，只在回复+消息成功入库后由调用方提交 */
export type PendingWritingContextCommit = {
  writingContextSummary?: string | null;
  writingContextSummaryUpToMessageId?: string | null;
  documentContextSummary?: string | null;
};

export type PreparedWritingIntentContext = {
  messages: ChatMessageInput[];
  usage: ContextUsage;
  document: Document;
  /** 有值表示本轮做了压缩；调用方在写作消息成功入库后调用 commitPreparedWritingContext */
  pendingWritingContextCommit?: PendingWritingContextCommit;
};

/**
 * 修 review#1：写作侧与问答侧 A1 对齐——把「文档摘要+锚点落库」推迟到回复成功之后。
 * 未提交时什么都不持久化：锚点不推进、原话不折进有损摘要，弱网失败下写作助手不会「突然失忆」。
 */
export function commitPreparedWritingContext(
  store: ContextStoreAdapter,
  documentId: string,
  prepared: { pendingWritingContextCommit?: PendingWritingContextCommit },
): void {
  const commit = prepared.pendingWritingContextCommit;
  if (!commit) return;
  store.updateDocumentContextFields(documentId, commit);
}

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
  limitTokens?: number;
  outputReserve?: number;
  modelId?: string | null;
};

const MIN_DOC_CHARS_FOR_STORY_BIBLE = 6000;

/** 修 review#7：同一文档正在抽取时不重复触发（intent+chat 双 prepare 会各调一次） */
const storyBibleExtractInFlight = new Set<string>();

/**
 * 后台自动抽取设定卡：不阻塞回复、抽到直接落库（幂等、无锚点、展示容错，即时持久安全）。
 * 独立于全篇摘要生成，故已有 summary 的旧文档也能补抽。已有设定卡/文档太短/正在抽取则跳过。
 */
function maybeExtractStoryBibleInBackground(
  params: PrepareWritingSidebarContextParams,
): void {
  const doc = params.document;
  const excerpt = params.documentBlock ?? '';
  if (doc.storyBible?.entries?.length) return;
  if (excerpt.length <= MIN_DOC_CHARS_FOR_STORY_BIBLE) return;
  if (storyBibleExtractInFlight.has(params.documentId)) return;
  storyBibleExtractInFlight.add(params.documentId);
  void extractStoryBible({
    model: params.model,
    documentExcerpt: excerpt,
    existing: doc.storyBible ?? null,
    existingSummary: doc.documentContextSummary ?? null,
    dialect: params.dialect,
  })
    .then((bible) => {
      if (bible.entries.length > 0) {
        try {
          params.store.updateDocumentContextFields(params.documentId, {
            storyBible: bible,
          });
        } catch {
          /* 设定卡展示是锦上添花，落库失败忽略 */
        }
      }
    })
    .catch(() => {
      /* 后台抽取失败忽略 */
    })
    .finally(() => {
      storyBibleExtractInFlight.delete(params.documentId);
    });
}

async function prepareWritingSidebarContext(
  params: PrepareWritingSidebarContextParams,
): Promise<PreparedWritingIntentContext> {
  const effectiveSelection = contextSelectionWithServerMarks(
    params.allMessages,
    params.contextSelection,
  );
  // 设定卡常驻注入：拼进 system prompt，永远发送、不参与压缩、不被裁切
  const baseSystemPrompt =
    params.systemPrompt ?? writingIntentPromptForDialect(params.dialect);
  const storyBibleBlock = formatStoryBibleForLlm(params.document.storyBible);
  const systemPrompt = storyBibleBlock
    ? `${storyBibleBlock}\n\n${baseSystemPrompt}`
    : baseSystemPrompt;
  let summary = params.document.writingContextSummary ?? null;
  let upToId = params.document.writingContextSummaryUpToMessageId ?? null;
  let doc = params.document;
  let pending: PendingWritingContextCommit | null = null;

  // 设定卡自动抽取：后台进行、不阻塞本轮回复；抽到就直接落库（设定卡无锚点、幂等、
  // 展示端容错，即时持久是安全的，不违反 A1）。本轮不等待，下次请求即带上；已有则跳过。
  // 独立于全篇摘要生成，故「已有 summary 但无设定卡」的旧文档也能补抽。
  maybeExtractStoryBibleInBackground(params);

  let documentBlock =
    params.referenceScope === 'chapter' ? '' : params.documentBlock;
  let chapterBlock = params.chapterBlock;

  const assembleOpts = {
    limitTokens: params.limitTokens,
    outputReserve: params.outputReserve,
    modelId: params.modelId,
  };

  const draftPreview = blocksFromWritingIntent(
    assembleWritingIntentContext({
      systemPrompt,
      summary,
      history: toTurns(writingHistoryAfterAnchor(params.allMessages, upToId)),
      chapterBlock,
      documentBlock,
      userMessage: params.userMessage,
      ...assembleOpts,
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
      ...assembleOpts,
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
        pendingWritingContextCommit: pending ?? undefined,
      };
    }

    const omitCount = assembled.messagesToCompact.length;
    if (omitCount > 0) {
      const toCompact = historyMsgs.slice(0, omitCount);
      const merged = await compactHistoryViaLlm({
        model: params.model,
        messages: toTurns(toCompact),
        existingSummary: summary,
        dialect: params.dialect,
      });
      // 修 review#1（HIGH）：压缩返回空时不推进锚点、不落库，保留既有摘要，避免逐字历史丢成空摘要
      if (!merged.trim()) break;
      summary = merged;
      const lastId = toCompact[toCompact.length - 1]?.id ?? upToId;
      upToId = lastId;
      // 不在 prepare 阶段落库，累积到 pending，回复成功后由调用方提交；本地同步更新 doc 供后续使用
      pending = {
        ...(pending ?? {}),
        writingContextSummary: summary,
        writingContextSummaryUpToMessageId: lastId,
      };
      doc = {
        ...doc,
        writingContextSummary: summary,
        writingContextSummaryUpToMessageId: lastId,
      };
    } else if (documentBlock.length > 6000 && !doc.documentContextSummary?.trim()) {
      const compactDoc = await compactDocumentExcerptViaLlm({
        model: params.model,
        documentExcerpt: documentBlock,
        dialect: params.dialect,
      });
      if (!compactDoc.trim()) break;
      // 修 review#4：documentContextSummary 是文档级缓存、无锚点、幂等 → 即时落库安全（不经 pending）。
      // 否则 API 双 prepare 只提交 chatPrepared，此摘要永不落库、每次请求白跑一次整篇压缩。
      doc = params.store.updateDocumentContextFields(params.documentId, {
        documentContextSummary: compactDoc,
      }) ?? { ...doc, documentContextSummary: compactDoc };
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
    ...assembleOpts,
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
    pendingWritingContextCommit: pending ?? undefined,
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

  const bibleBlock = formatStoryBibleForLlm(params.document.storyBible);
  const assembled = assembleWritingIntentContext({
    systemPrompt: bibleBlock
      ? `${bibleBlock}\n\n${writingIntentPromptForDialect(params.dialect)}`
      : writingIntentPromptForDialect(params.dialect),
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
  storyBible?: StoryBible | null;
  limitTokens?: number;
  outputReserve?: number;
  modelId?: string | null;
}): { messages: ChatMessageInput[]; usage: ContextUsage } {
  const actionPrompt = ACTION_PROMPTS[params.action] ?? ACTION_PROMPTS['润色'];
  const isContinue = params.action === '续写';
  const useFullDoc = params.understandingScope === 'document';

  const storyBibleBlock = formatStoryBibleForLlm(params.storyBible);
  const system = `${storyBibleBlock ? `${storyBibleBlock}\n\n` : ''}${writingPersonaForDialect(params.dialect)}

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
