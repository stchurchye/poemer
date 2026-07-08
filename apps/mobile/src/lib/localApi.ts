import type {
  ChatIntentAnalyzeResult,
  ContextPreview,
  ContextSelection,
  ContextUsage,
  Document,
  Revision,
  WritingAssistantMessage,
  WritingIntentAnalyzeResult,
  WritingUnderstandingScope,
} from '@shiren/shared';
import type { LocalStore } from '@shiren/shared';
import {
  analyzeChatIntentLocal,
  analyzeWritingIntentLocal,
  commitPreparedChatContext,
  commitPreparedWritingContext,
  compactChatSession as compactChatSessionEngine,
  completeChatMessages,
  prepareChatContext,
  prepareWritingChatContext,
  prepareWritingIntentContext,
  previewChatContextPreview,
  previewChatContextUsage,
  previewWritingIntentContextPreview,
  previewWritingIntentContextUsage,
  runWritingExecute,
  runWritingExecuteRetry,
  summarizeChatSessionTitleLocal,
  type ContextStoreAdapter,
} from '@shiren/engine';
import {
  stripWritingIntentDisplayText,
  buildWritingAssistantContextBlocks,
  assistantWelcomeLine,
  assistantRevisionReadyLine,
  CHAT_MAX_IMAGES_PER_MESSAGE,
  chatImageTurnLlmNotice,
  chatPendingUserForContext,
  chatStoredUserContent,
  ZenMuxError,
  zenmuxChatWithImages,
  type ZenMuxChatImage,
  errorMessages,
  type ErrorCode,
} from '@shiren/shared';
import {
  DEEPSEEK_MODEL_PRO,
  getContextWindowTokens,
  getOutputReserveTokens,
  ZENMUX_MODEL_CHAT,
} from '@shiren/shared';
import { getZenMuxApiKey } from './zenmuxKey';
import { createDeepSeekModelClient, LocalModelError, verifyDeepSeekKeyDirect } from './localModelClient';
import { createZenMuxModelClient } from './zenmuxModelClient';
import { getDeepSeekApiKey } from './deepseekKey';
import { getStoredDialect } from './tts';
import {
  getDashScopeStatusLocal,
  getZenMuxStatusLocal,
  ocrImageDirect,
  synthesizeSpeechDirect,
  transcribeAudioDirect,
  verifyDashScopeKeyLocal,
  verifyZenMuxKeyLocal,
} from './localVendors';

type ApiResult<T> = { ok: true; data: T; requestId: string };

function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data, requestId: `local-${Date.now()}` };
}

type WritingIntentApiData = WritingIntentAnalyzeResult & { contextUsage: ContextUsage };

function okWritingIntent(
  data: WritingIntentAnalyzeResult,
  contextUsage?: ContextUsage,
): ApiResult<WritingIntentApiData> {
  return ok({ ...data, contextUsage: contextUsage ?? emptyContextUsage });
}

function parseChatImages(raw: unknown): ZenMuxChatImage[] {
  if (!Array.isArray(raw)) return [];
  const images: ZenMuxChatImage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const b64 = (item as { imageBase64?: string }).imageBase64?.trim();
    if (!b64 || b64.length < 32 || b64.length > 12_000_000) continue;
    images.push({
      imageBase64: b64,
      mimeType: (item as { mimeType?: string }).mimeType,
    });
    if (images.length >= CHAT_MAX_IMAGES_PER_MESSAGE) break;
  }
  return images;
}

function requireStore(store: LocalStore | null): LocalStore {
  if (!store) throw new Error('LOCAL_STORE_NOT_READY');
  return store;
}

const LOCAL_ERROR_CODE: Record<string, ErrorCode> = {
  DOCUMENT_NOT_FOUND: 'NOT_FOUND',
  CHAT_SESSION_NOT_FOUND: 'NOT_FOUND',
  REVISION_NOT_FOUND: 'REVISION_NOT_FOUND',
  BLOCK_NOT_FOUND: 'BLOCK_NOT_FOUND',
  WRITING_ASSISTANT_MESSAGE_NOT_FOUND: 'ASSISTANT_INTENT_NOT_FOUND',
  VALIDATION: 'VALIDATION',
};

function throwAppError(code: ErrorCode): never {
  const entry = errorMessages[code];
  const err = new Error(entry.message) as Error & { code?: string; hint?: string };
  err.code = code;
  err.hint = entry.hint;
  throw err;
}

function notFound(kind: string): never {
  throwAppError(LOCAL_ERROR_CODE[kind] ?? 'NOT_FOUND');
}

const emptyContextUsage: ContextUsage = {
  usedTokens: 0,
  limitTokens: getContextWindowTokens(),
  ratio: 0,
  breakdown: {
    system: 0,
    summary: 0,
    history: 0,
    document: 0,
    pendingUser: 0,
    outputReserve: getOutputReserveTokens(),
  },
  compacted: false,
  droppedVerbatimTurns: 0,
};

const emptyContextPreview: ContextPreview = {
  blocks: [],
  usage: emptyContextUsage,
  messages: [],
};

function rethrowAsApiError(e: unknown): never {
  if (e instanceof LocalModelError) {
    const err = new Error(e.message) as Error & { code?: string; hint?: string };
    err.code = e.code;
    err.hint = e.hint;
    throw err;
  }
  throw e;
}

async function intentModel() {
  return createDeepSeekModelClient('DeepSeek·意图/改稿');
}

async function textModel() {
  return createZenMuxModelClient({ label: 'ZenMux·侧栏闲聊' });
}

async function chatReplyModel() {
  return createZenMuxModelClient({
    model: ZENMUX_MODEL_CHAT,
    webSearch: true,
    label: 'ZenMux·问问题正文',
  });
}

export function createLocalApi(deps: {
  getStore: () => LocalStore | null;
  markChanged: () => void;
}) {
  function store() {
    return requireStore(deps.getStore());
  }

  function contextStoreAdapter(): ContextStoreAdapter {
    const s = store();
    return {
      getChatSession: (id) => s.getChatSession(id),
      getChatMessages: (id) => s.getChatMessages(id),
      updateChatSessionContext: (sessionId, summary, upToMessageId) => {
        const updated = s.updateChatSessionContext(sessionId, summary, upToMessageId);
        if (updated) deps.markChanged();
        return updated;
      },
      getDocument: (id) => s.getDocument(id),
      getWritingAssistantMessages: (id) => s.getWritingAssistantMessages(id),
      updateDocumentContextFields: (documentId, fields) => {
        const updated = s.updateDocumentContextFields(documentId, fields);
        if (updated) deps.markChanged();
        return updated;
      },
    };
  }

  return {
    health: async () => ok({ service: '小作家-local' }),

    listDocuments: async () => ok(store().listDocuments()),

    createDocument: async (title: string) => {
      const doc = store().createDocument(title);
      deps.markChanged();
      return ok(doc);
    },

    getDocument: async (id: string) => {
      const doc = store().getDocument(id);
      if (!doc) notFound('DOCUMENT_NOT_FOUND');
      return ok(doc);
    },

    updateDocument: async (id: string, patch: Partial<Document>) => {
      const doc = store().updateDocument(id, patch);
      if (!doc) notFound('DOCUMENT_NOT_FOUND');
      deps.markChanged();
      return ok(doc);
    },

    saveDocumentContent: async (
      documentId: string,
      chapterId: string,
      blockId: string,
      content: string,
    ) => {
      const doc = store().saveDocumentContent(documentId, chapterId, blockId, content);
      if (!doc) notFound('DOCUMENT_NOT_FOUND');
      deps.markChanged();
      return ok(doc);
    },

    updateChapterTitle: async (documentId: string, chapterId: string, title: string) => {
      const doc = store().updateChapterTitle(documentId, chapterId, title);
      if (!doc) notFound('DOCUMENT_NOT_FOUND');
      deps.markChanged();
      return ok(doc);
    },

    hideDocument: async (id: string) => {
      const doc = store().hideDocument(id);
      if (!doc) notFound('DOCUMENT_NOT_FOUND');
      deps.markChanged();
      return ok(doc);
    },

    restoreDocument: async (id: string) => {
      const doc = store().restoreDocument(id);
      if (!doc) notFound('DOCUMENT_NOT_FOUND');
      deps.markChanged();
      return ok(doc);
    },

    addChapter: async (documentId: string, title?: string) => {
      const doc = store().addChapter(documentId, title);
      if (!doc) notFound('DOCUMENT_NOT_FOUND');
      deps.markChanged();
      return ok(doc);
    },

    listRevisions: async (documentId: string) => ok(store().listRevisions(documentId)),

    getRevision: async (documentId: string, revisionId: string) => {
      const rev = store().getRevision(revisionId);
      if (!rev || rev.documentId !== documentId) notFound('REVISION_NOT_FOUND');
      return ok(rev);
    },

    acceptRevision: async (
      documentId: string,
      revisionId: string,
      editedSnapshot?: string,
    ) => {
      const rev = store().acceptRevision(revisionId, editedSnapshot);
      if (!rev) notFound('REVISION_NOT_FOUND');
      const doc = store().getDocument(documentId);
      if (!doc) notFound('DOCUMENT_NOT_FOUND');
      deps.markChanged();
      return ok(doc);
    },

    rejectRevision: async (documentId: string, revisionId: string) => {
      const rev = store().rejectRevision(revisionId);
      if (!rev || rev.documentId !== documentId) notFound('REVISION_NOT_FOUND');
      deps.markChanged();
      return ok(rev);
    },

    rollback: async (documentId: string, revisionId: string) => {
      const rev = store().rollback(documentId, revisionId);
      if (!rev) notFound('REVISION_NOT_FOUND');
      deps.markChanged();
      return ok(rev);
    },

    listChatSessions: async () => ok(store().listChatSessions()),

    createChatSession: async (title?: string) => {
      const session = store().createChatSession(title?.trim() || '新话题');
      deps.markChanged();
      return ok(session);
    },

    getChatMessages: async (sessionId: string) => ok(store().getChatMessages(sessionId)),

    getWritingAssistantMessages: async (documentId: string) => {
      const dialect = await getStoredDialect();
      store().ensureWritingAssistantWelcome(documentId, assistantWelcomeLine(dialect));
      deps.markChanged();
      return ok(store().getWritingAssistantMessages(documentId));
    },

    analyzeChatIntent: async (
      sessionId: string,
      body: { content: string; source?: 'text' | 'voice' },
    ) => {
      try {
        const source = body.source === 'voice' ? 'voice' : 'text';
        const dialect = await getStoredDialect();
        const data = await analyzeChatIntentLocal(await intentModel(), {
          content: body.content,
          source,
          history: store().getChatMessages(sessionId),
          dialect,
        });
        return ok(data as ChatIntentAnalyzeResult);
      } catch (e) {
        rethrowAsApiError(e);
      }
    },

    sendChatMessage: async (
      sessionId: string,
      body: {
        content: string;
        images?: unknown[];
        imagePreviewUris?: string[];
        contextSelection?: ContextSelection;
      },
    ) => {
      const text = body.content?.trim() ?? '';
      const images = parseChatImages(body.images);
      if (!text && images.length === 0) notFound('VALIDATION');

      const imageOnlyFallback = '请根据我上传的图片回答';
      const storedContent = chatStoredUserContent({
        text,
        imageCount: images.length,
        imageOnlyFallback,
      });
      const pendingForContext = chatPendingUserForContext(text, images.length);

      if (!store().getChatSession(sessionId)) notFound('CHAT_SESSION_NOT_FOUND');

      try {
        const dialect = await getStoredDialect();
        const textM = await textModel();
        const ctxStore = contextStoreAdapter();
        const prepared = await prepareChatContext({
          store: ctxStore,
          model: textM,
          sessionId,
          pendingUser: pendingForContext,
          dialect,
          contextSelection: body.contextSelection,
          // 组装窗口按真实回复模型（gpt-5.4，272k）取；未接则回退保守默认
          modelId: ZENMUX_MODEL_CHAT,
        });

        let reply: string;
        if (images.length > 0) {
          const zenmuxKey = await getZenMuxApiKey();
          if (!zenmuxKey) {
            const err = new Error(
              '带图片的问问题需要先在设置里填写 ZenMux 密钥（与问问题回答为同一项）',
            ) as Error & {
              code?: string;
            };
            err.code = 'ZENMUX_KEY_MISSING';
            throw err;
          }
          try {
            reply = await zenmuxChatWithImages({
              apiKey: zenmuxKey,
              messages: prepared.messages.map((msg) => ({
                role: msg.role,
                content: msg.content,
              })),
              images,
              imageNotice: chatImageTurnLlmNotice(images.length),
            });
          } catch (e) {
            if (e instanceof ZenMuxError) {
              const err = new Error(e.message) as Error & { code?: string };
              err.code = 'ZENMUX_KEY_MISSING';
              throw err;
            }
            throw e;
          }
        } else {
          reply = await completeChatMessages(await chatReplyModel(), prepared.messages);
        }

        const user = store().addChatMessage(sessionId, 'user', storedContent, {
          imagePreviewUris: body.imagePreviewUris,
        });
        if (!user) notFound('CHAT_SESSION_NOT_FOUND');
        const assistant = store().addChatMessage(sessionId, 'assistant', reply);
        if (!assistant) notFound('CHAT_SESSION_NOT_FOUND');

        // 修 A1：回复+两条消息成功入库后，才提交压缩摘要+锚点（失败则不提交，原话不丢）
        commitPreparedChatContext(ctxStore, sessionId, prepared);

        let sessionOut = prepared.session;
        try {
          const title = await summarizeChatSessionTitleLocal(textM, {
            messages: store().getChatMessages(sessionId).map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
            lastUserMessage: storedContent,
            dialect,
          });
          sessionOut = store().updateChatSessionTitle(sessionId, title) ?? sessionOut;
        } catch {
          const fallback = storedContent.replace(/\s+/g, ' ').slice(0, 28);
          if (fallback) {
            sessionOut = store().updateChatSessionTitle(sessionId, fallback) ?? sessionOut;
          }
        }

        deps.markChanged();
        return ok({
          user,
          assistant,
          session: sessionOut,
          contextUsage: prepared.usage,
        });
      } catch (e) {
        rethrowAsApiError(e);
      }
    },

    getChatContextUsage: async (
      sessionId: string,
      params?: { pending?: string; contextSelection?: ContextSelection },
    ) => {
      if (!store().getChatSession(sessionId)) notFound('CHAT_SESSION_NOT_FOUND');
      try {
        const dialect = await getStoredDialect();
        const usage = await previewChatContextUsage({
          store: contextStoreAdapter(),
          sessionId,
          pendingUser: params?.pending,
          dialect,
          contextSelection: params?.contextSelection,
        });
        return ok(usage);
      } catch (e) {
        rethrowAsApiError(e);
      }
    },

    getChatContextPreview: async (
      sessionId: string,
      params?: { pending?: string; contextSelection?: ContextSelection },
    ) => {
      if (!store().getChatSession(sessionId)) notFound('CHAT_SESSION_NOT_FOUND');
      try {
        const dialect = await getStoredDialect();
        const preview = await previewChatContextPreview({
          store: contextStoreAdapter(),
          sessionId,
          pendingUser: params?.pending,
          dialect,
          contextSelection: params?.contextSelection,
        });
        return ok(preview);
      } catch (e) {
        rethrowAsApiError(e);
      }
    },

    compactChatSession: async (sessionId: string) => {
      if (!store().getChatSession(sessionId)) notFound('CHAT_SESSION_NOT_FOUND');
      try {
        const dialect = await getStoredDialect();
        const { confirmation, usage } = await compactChatSessionEngine({
          store: contextStoreAdapter(),
          model: await textModel(),
          sessionId,
          dialect,
        });
        const assistant = store().addChatMessage(sessionId, 'assistant', confirmation);
        if (!assistant) notFound('CHAT_SESSION_NOT_FOUND');
        deps.markChanged();
        return ok({
          confirmation,
          assistantMessage: assistant,
          contextUsage: usage,
        });
      } catch (e) {
        rethrowAsApiError(e);
      }
    },

    analyzeWritingAssistantIntent: async (
      documentId: string,
      payload: {
        content: string;
        chapterTitle: string;
        chapterContent: string;
        articleExcerpt?: string;
        documentExcerpt?: string;
        source?: 'text' | 'voice';
        directChat?: boolean;
        referenceScope?: WritingUnderstandingScope;
        contextSelection?: ContextSelection;
      },
    ) => {
      const source = payload.source === 'voice' ? 'voice' : 'text';
      const dialect = await getStoredDialect();
      const history = store()
        .getWritingAssistantMessages(documentId)
        .filter((m) => m.kind === 'chat')
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const persistChatExchange = (assistantContent: string) => {
        const user = store().addWritingAssistantMessage({
          documentId,
          role: 'user',
          content: payload.content,
          kind: 'chat',
        });
        if (!user) notFound('DOCUMENT_NOT_FOUND');
        const assistant = store().addWritingAssistantMessage({
          documentId,
          role: 'assistant',
          content: assistantContent.trim(),
          kind: 'chat',
        });
        if (!assistant) notFound('DOCUMENT_NOT_FOUND');
        deps.markChanged();
        return { user, assistant, chatReply: assistantContent.trim() };
      };

      try {
        const writingM = await intentModel();

        if (payload.directChat) {
          const doc = store().getDocument(documentId);
          if (!doc) notFound('DOCUMENT_NOT_FOUND');
          const scope = payload.referenceScope ?? 'document';
          const { chapterBlock, documentBlock } = buildWritingAssistantContextBlocks({
            chapterTitle: payload.chapterTitle,
            chapterContent:
              payload.chapterContent ||
              payload.articleExcerpt?.trim() ||
              '（本章尚无正文）',
            documentExcerpt: payload.documentExcerpt ?? '',
            referenceScope: scope,
          });
          const prepared = await prepareWritingChatContext({
            store: contextStoreAdapter(),
            model: writingM,
            documentId,
            document: doc,
            allMessages: store().getWritingAssistantMessages(documentId),
            chapterBlock,
            documentBlock,
            userMessage: payload.content,
            dialect,
            contextSelection: payload.contextSelection,
            referenceScope: scope,
          });
          const chatReply = await completeChatMessages(writingM, prepared.messages);
          const { user, assistant } = persistChatExchange(chatReply);
          // 修 review#1：回复+消息成功入库后才提交写作侧压缩产物
          commitPreparedWritingContext(contextStoreAdapter(), documentId, prepared);
          return okWritingIntent(
            {
              mode: 'chat',
              referenceScope: scope,
              displayText: chatReply,
              action: '',
              instruction: '',
              ready: true,
              chatReply,
              user,
              assistant,
              transcript: source === 'voice' ? payload.content : undefined,
              source,
            },
            prepared.usage,
          );
        }

        const intent = await analyzeWritingIntentLocal(await intentModel(), {
          content: payload.content,
          chapterTitle: payload.chapterTitle,
          chapterContent: payload.chapterContent,
          documentExcerpt: payload.documentExcerpt,
          articleExcerpt: payload.articleExcerpt,
          history,
          dialect,
        });

        const referenceScope =
          payload.referenceScope ?? intent.referenceScope ?? 'document';

        if (intent.mode === 'guide' && intent.guide) {
          return okWritingIntent({
            mode: 'guide',
            guide: intent.guide,
            referenceScope,
            displayText: intent.displayText?.trim() ?? '',
            action: '',
            instruction: '',
            ready: true,
            transcript: source === 'voice' ? payload.content : undefined,
            source,
          });
        }

        const base: WritingIntentAnalyzeResult = {
          mode: intent.mode,
          referenceScope,
          displayText: intent.displayText,
          action: intent.action,
          instruction: intent.instruction,
          ready: intent.ready,
          transcript: source === 'voice' ? payload.content : undefined,
          source,
        };

        if (intent.mode === 'revise' && intent.ready) {
          const doc = store().getDocument(documentId);
          if (!doc) notFound('DOCUMENT_NOT_FOUND');
          const scope = referenceScope;
          const { chapterBlock, documentBlock } = buildWritingAssistantContextBlocks({
            chapterTitle: payload.chapterTitle,
            chapterContent:
              payload.chapterContent ||
              payload.articleExcerpt?.trim() ||
              '（本章尚无正文）',
            documentExcerpt: payload.documentExcerpt ?? '',
            referenceScope: scope,
          });
          const prepared = await prepareWritingIntentContext({
            store: contextStoreAdapter(),
            model: writingM,
            documentId,
            document: doc,
            allMessages: store().getWritingAssistantMessages(documentId),
            chapterBlock,
            documentBlock,
            userMessage: payload.content,
            dialect,
            contextSelection: payload.contextSelection,
            referenceScope: scope,
          });
          return okWritingIntent(base, prepared.usage);
        }

        if (intent.mode === 'revise' && !intent.ready) {
          return okWritingIntent({
            ...base,
            action: intent.action || '润色',
          });
        }

        if (!intent.ready && intent.displayText.trim()) {
          const { user, assistant, chatReply } = persistChatExchange(intent.displayText);
          return okWritingIntent({
            ...base,
            mode: 'chat',
            ready: false,
            displayText: chatReply,
            chatReply,
            user,
            assistant,
          });
        }

        const doc = store().getDocument(documentId);
        if (!doc) notFound('DOCUMENT_NOT_FOUND');
        const scope = referenceScope;
        const { chapterBlock, documentBlock } = buildWritingAssistantContextBlocks({
          chapterTitle: payload.chapterTitle,
          chapterContent:
            payload.chapterContent ||
            payload.articleExcerpt?.trim() ||
            '（本章尚无正文）',
          documentExcerpt: payload.documentExcerpt ?? '',
          referenceScope: scope,
        });
        const prepared = await prepareWritingChatContext({
          store: contextStoreAdapter(),
          model: writingM,
          documentId,
          document: doc,
          allMessages: store().getWritingAssistantMessages(documentId),
          chapterBlock,
          documentBlock,
          userMessage: payload.content,
          dialect,
          contextSelection: payload.contextSelection,
          referenceScope: scope,
        });
        const chatReply = await completeChatMessages(writingM, prepared.messages);
        const { user, assistant } = persistChatExchange(chatReply);
        // 修 review#1：回复+消息成功入库后才提交写作侧压缩产物
        commitPreparedWritingContext(contextStoreAdapter(), documentId, prepared);
        return okWritingIntent(
          {
            ...base,
            mode: 'chat',
            ready: true,
            displayText: chatReply,
            chatReply,
            user,
            assistant,
          },
          prepared.usage,
        );
      } catch (e) {
        rethrowAsApiError(e);
      }
    },

    sendWritingAssistantMessage: async (
      documentId: string,
      payload: {
        content: string;
        commitIntent: { displayText: string; action: string; instruction: string };
      },
    ) => {
      const user = store().addWritingAssistantMessage({
        documentId,
        role: 'user',
        content: payload.content,
        kind: 'chat',
      });
      if (!user) notFound('DOCUMENT_NOT_FOUND');
      const assistant = store().addWritingAssistantMessage({
        documentId,
        role: 'assistant',
        content: stripWritingIntentDisplayText(payload.commitIntent.displayText.trim()),
        kind: 'intent_confirm',
        pendingAction: payload.commitIntent.action?.trim() || '润色',
        pendingInstruction: payload.commitIntent.instruction?.trim() || payload.content,
        confirmStatus: 'pending',
      });
      if (!assistant) notFound('DOCUMENT_NOT_FOUND');
      deps.markChanged();
      return ok({
        user,
        assistant,
        contextUsage: emptyContextUsage,
      });
    },

    confirmWritingAssistant: async (
      documentId: string,
      body: {
        messageId: string;
        approved: boolean;
        blockId: string;
        articleExcerpt?: string;
        chapterId?: string;
        chapterTitle?: string;
        chapterContent: string;
        documentExcerpt?: string;
        understandingScope: WritingUnderstandingScope;
      },
    ) => {
      if (!body.approved) {
        const assistant = store().updateWritingAssistantMessage(documentId, body.messageId, {
          confirmStatus: 'rejected',
        });
        if (!assistant) notFound('WRITING_ASSISTANT_MESSAGE_NOT_FOUND');
        deps.markChanged();
        return ok({
          assistant,
          revision: undefined,
          oldText: undefined,
          newText: undefined,
          comment: undefined,
          contextUsage: emptyContextUsage,
        });
      }

      const pending = store()
        .getWritingAssistantMessages(documentId)
        .find((m) => m.id === body.messageId);
      if (!pending || pending.kind !== 'intent_confirm') {
        notFound('WRITING_ASSISTANT_MESSAGE_NOT_FOUND');
      }

      const doc = store().getDocument(documentId);
      if (!doc) notFound('DOCUMENT_NOT_FOUND');
      let found = store().findBlock(documentId, body.blockId);
      if (!found && body.chapterId) {
        const chapter = doc.chapters.find((ch) => ch.id === body.chapterId);
        const block = chapter?.blocks[0];
        if (chapter && block) found = { chapter, block };
      }
      if (!found) notFound('BLOCK_NOT_FOUND');

      const action = pending.pendingAction ?? '润色';
      const instruction = pending.pendingInstruction ?? pending.content ?? '';
      const oldText = found.block.content;
      const understandingScope: WritingUnderstandingScope =
        body.understandingScope === 'chapter' ? 'chapter' : 'document';

      try {
        const dialect = await getStoredDialect();
        const writingM = await intentModel();
        store().updateWritingAssistantMessage(documentId, body.messageId, {
          confirmStatus: 'approved',
        });

        const executed = await runWritingExecute({
          model: writingM,
          action,
          oldText,
          instruction,
          styleGuide: doc.styleGuide,
          dialect,
          chapterTitle: body.chapterTitle?.trim() || found.chapter.title,
          understandingScope,
          documentExcerpt: body.documentExcerpt?.trim(),
          documentContextSummary: doc.documentContextSummary,
          storyBible: doc.storyBible,
        });

        const revision = store().createRevision({
          documentId,
          blockId: body.blockId,
          parentRevisionId: found.block.currentRevisionId,
          snapshot: executed.text,
          previousSnapshot: oldText,
          summary:
            action === '续写'
              ? `续写了${found.chapter.title}的一段`
              : `润色了${found.chapter.title}的一段`,
          source: 'ai',
          status: 'pending',
          suggestAction: action,
          suggestInstruction: instruction || undefined,
          suggestUnderstandingScope: understandingScope,
          suggestEvaluation: executed.basis.evaluation,
          suggestRationale: executed.basis.rationale,
        });

        const assistant = store().addWritingAssistantMessage({
          documentId,
          role: 'assistant',
          content: assistantRevisionReadyLine(dialect),
          kind: 'revision_ready',
          revisionId: revision.id,
          suggestAction: action,
          suggestUnderstandingScope: understandingScope,
          suggestEvaluation: executed.basis.evaluation,
          suggestRationale: executed.basis.rationale,
        });
        if (!assistant) notFound('DOCUMENT_NOT_FOUND');
        deps.markChanged();
        return ok({
          assistant,
          revision,
          oldText,
          newText: executed.text,
          comment: executed.comment,
          contextUsage: executed.contextUsage,
        });
      } catch (e) {
        rethrowAsApiError(e);
      }
    },

    aiSuggest: async (
      documentId: string,
      blockId: string,
      action: string,
      options?: {
        instruction?: string;
        retry?: {
          baseInstruction: string;
          previousSuggestion: string;
          additionalFeedback: string;
          priorFeedback?: string[];
        };
      },
    ) => {
      const doc = store().getDocument(documentId);
      if (!doc) notFound('DOCUMENT_NOT_FOUND');
      const found = store().findBlock(documentId, blockId);
      if (!found) notFound('BLOCK_NOT_FOUND');
      const oldText = found.block.content;

      try {
        const dialect = await getStoredDialect();
        const writingM = await intentModel();
        let text: string;
        let comment: string;
        let basis: import('@shiren/shared').WritingExecuteBasis;

        if (options?.retry) {
          const feedback = options.retry.additionalFeedback?.trim();
          if (!feedback) notFound('VALIDATION');
          const result = await runWritingExecuteRetry({
            model: writingM,
            action,
            oldText,
            baseInstruction: options.retry.baseInstruction ?? '',
            previousSuggestion: options.retry.previousSuggestion,
            additionalFeedback: feedback,
            priorFeedback: options.retry.priorFeedback,
            styleGuide: doc.styleGuide,
            dialect,
            storyBible: doc.storyBible,
          });
          text = result.text;
          comment = result.comment;
          basis = result.basis;
        } else {
          const executed = await runWritingExecute({
            model: writingM,
            action,
            oldText,
            instruction: options?.instruction,
            styleGuide: doc.styleGuide,
            dialect,
            chapterTitle: found.chapter.title,
            storyBible: doc.storyBible,
          });
          text = executed.text;
          comment = executed.comment;
          basis = executed.basis;
        }

        const suggestInstruction = options?.retry
          ? [options.retry.baseInstruction?.trim(), options.retry.additionalFeedback?.trim()]
              .filter(Boolean)
              .join('\n')
          : options?.instruction?.trim();

        const revision = store().createRevision({
          documentId,
          blockId,
          parentRevisionId: found.block.currentRevisionId,
          snapshot: text,
          previousSnapshot: oldText,
          summary:
            action === '续写'
              ? `续写了${found.chapter.title}的一段`
              : `润色了${found.chapter.title}的一段`,
          source: 'ai',
          status: 'pending',
          suggestAction: action,
          suggestInstruction: suggestInstruction || undefined,
          suggestEvaluation: basis.evaluation,
          suggestRationale: basis.rationale,
        });
        deps.markChanged();
        return ok({
          revision,
          oldText,
          newText: text,
          comment,
        });
      } catch (e) {
        rethrowAsApiError(e);
      }
    },

    getWritingAssistantContextUsage: async (
      documentId: string,
      params: {
        chapterTitle: string;
        chapterContent: string;
        documentExcerpt: string;
        pending?: string;
        contextSelection?: ContextSelection;
      },
    ) => {
      const doc = store().getDocument(documentId);
      if (!doc) notFound('DOCUMENT_NOT_FOUND');
      try {
        const dialect = await getStoredDialect();
        const { chapterBlock, documentBlock } = buildWritingAssistantContextBlocks({
          chapterTitle: params.chapterTitle,
          chapterContent: params.chapterContent || '（本章尚无正文）',
          documentExcerpt: params.documentExcerpt,
          referenceScope: 'document',
        });
        const usage = await previewWritingIntentContextUsage({
          document: doc,
          allMessages: store().getWritingAssistantMessages(documentId),
          chapterBlock,
          documentBlock,
          pendingUser: params.pending,
          dialect,
          contextSelection: params.contextSelection,
        });
        return ok(usage);
      } catch (e) {
        rethrowAsApiError(e);
      }
    },

    getWritingContextPreview: async (
      documentId: string,
      params: {
        chapterTitle: string;
        chapterContent: string;
        documentExcerpt: string;
        pending?: string;
        contextSelection?: ContextSelection;
      },
    ) => {
      const doc = store().getDocument(documentId);
      if (!doc) notFound('DOCUMENT_NOT_FOUND');
      try {
        const dialect = await getStoredDialect();
        const { chapterBlock, documentBlock } = buildWritingAssistantContextBlocks({
          chapterTitle: params.chapterTitle,
          chapterContent: params.chapterContent || '（本章尚无正文）',
          documentExcerpt: params.documentExcerpt,
          referenceScope: 'document',
        });
        const preview = await previewWritingIntentContextPreview({
          document: doc,
          allMessages: store().getWritingAssistantMessages(documentId),
          chapterBlock,
          documentBlock,
          pendingUser: params.pending,
          dialect,
          contextSelection: params.contextSelection,
        });
        return ok(preview);
      } catch (e) {
        rethrowAsApiError(e);
      }
    },

    getDeepSeekStatus: async () => {
      const key = await getDeepSeekApiKey();
      return ok({
        configured: Boolean(key),
        source: 'local',
        model: DEEPSEEK_MODEL_PRO,
        displayName: 'DeepSeek Pro（写作/问问题）',
      });
    },

    verifyDeepSeekKey: async (apiKey?: string) => {
      const key = apiKey?.trim() || (await getDeepSeekApiKey());
      if (!key) return ok({ valid: false, message: '请先填入密钥' });
      return ok(await verifyDeepSeekKeyDirect(key));
    },

    transcribeAudio: async (body: {
      audioBase64: string;
      format?: string;
      durationSec?: number;
    }) => {
      try {
        const text = await transcribeAudioDirect(body);
        return ok({ text });
      } catch (e) {
        rethrowAsApiError(e);
      }
    },

    synthesizeSpeech: async (body: {
      text: string;
      voice?: string;
      dialect?: 'mandarin' | 'cantonese';
    }) => {
      try {
        const data = await synthesizeSpeechDirect(body);
        return ok(data);
      } catch (e) {
        rethrowAsApiError(e);
      }
    },

    ocrImage: async (body: { imageBase64: string; mimeType?: string; purpose?: string }) => {
      try {
        const text = await ocrImageDirect(body);
        return ok({ text });
      } catch (e) {
        rethrowAsApiError(e);
      }
    },

    getZenMuxStatus: async () => ok(await getZenMuxStatusLocal()),

    verifyZenMuxKey: async (apiKey?: string) => ok(await verifyZenMuxKeyLocal(apiKey)),

    getDashScopeStatus: async () => ok(await getDashScopeStatusLocal()),

    verifyDashScopeKey: async (apiKey?: string) => ok(await verifyDashScopeKeyLocal(apiKey)),
  };
}

export type LocalApi = ReturnType<typeof createLocalApi>;
