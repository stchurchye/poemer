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
  generateChatReply,
  generateRevisionSnapshotLocal,
  generateWritingChatReplyLocal,
} from '@shiren/engine';
import { stripWritingIntentDisplayText } from '@shiren/shared';
import { DEEPSEEK_MODEL_PRO } from '@shiren/shared';
import { createDeepSeekModelClient, LocalModelError, verifyDeepSeekKeyDirect } from './localModelClient';
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

function okWritingIntent(data: WritingIntentAnalyzeResult): ApiResult<WritingIntentApiData> {
  return ok({ ...data, contextUsage: emptyContextUsage });
}

function requireStore(store: LocalStore | null): LocalStore {
  if (!store) throw new Error('LOCAL_STORE_NOT_READY');
  return store;
}

function notFound(message: string): never {
  const err = new Error(message) as Error & { code?: string };
  err.code = 'NOT_FOUND';
  throw err;
}

const emptyContextUsage: ContextUsage = {
  usedTokens: 0,
  limitTokens: 1_000_000,
  ratio: 0,
  breakdown: {
    system: 0,
    summary: 0,
    history: 0,
    document: 0,
    pendingUser: 0,
    outputReserve: 20_000,
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

async function model() {
  return createDeepSeekModelClient();
}

export function createLocalApi(deps: {
  getStore: () => LocalStore | null;
  markChanged: () => void;
}) {
  function store() {
    return requireStore(deps.getStore());
  }

  return {
    health: async () => ok({ service: '诗人-local' }),

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

    getWritingAssistantMessages: async (documentId: string) =>
      ok(store().getWritingAssistantMessages(documentId)),

    analyzeChatIntent: async (
      sessionId: string,
      body: { content: string; source?: 'text' | 'voice' },
    ) => {
      try {
        const source = body.source === 'voice' ? 'voice' : 'text';
        const dialect = await getStoredDialect();
        const data = await analyzeChatIntentLocal(await model(), {
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
      body: { content: string; images?: unknown[]; contextSelection?: ContextSelection },
    ) => {
      if (body.images && body.images.length > 0) {
        const err = new Error('带图片的问问题需要配置识图密钥') as Error & { code?: string };
        err.code = 'ZENMUX_KEY_MISSING';
        throw err;
      }
      try {
        const sessions = store().listChatSessions();
        const session = sessions.find((s) => s.id === sessionId);
        if (!session) notFound('CHAT_SESSION_NOT_FOUND');
        const user = store().addChatMessage(sessionId, 'user', body.content);
        if (!user) notFound('CHAT_SESSION_NOT_FOUND');
        const replyText = await generateChatReply(await model(), {
          session: session!,
          history: store().getChatMessages(sessionId),
          userText: body.content,
        });
        const assistant = store().addChatMessage(sessionId, 'assistant', replyText);
        if (!assistant) notFound('CHAT_SESSION_NOT_FOUND');
        deps.markChanged();
        return ok({
          user,
          assistant,
          session: store().getChatSession(sessionId),
          contextUsage: emptyContextUsage,
        });
      } catch (e) {
        rethrowAsApiError(e);
      }
    },

    getChatContextUsage: async () => ok(emptyContextUsage),

    getChatContextPreview: async () => ok(emptyContextPreview),

    compactChatSession: async (sessionId: string) => {
      const assistant = store().addChatMessage(
        sessionId,
        'assistant',
        '已为您整理上下文，可以继续提问。',
      );
      if (!assistant) notFound('CHAT_SESSION_NOT_FOUND');
      deps.markChanged();
      return ok({
        confirmation: '已压缩',
        assistantMessage: assistant,
        contextUsage: emptyContextUsage,
      });
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
        const m = await model();

        if (payload.directChat) {
          const chatReply = await generateWritingChatReplyLocal(m, {
            content: payload.content,
            chapterTitle: payload.chapterTitle,
            chapterContent: payload.chapterContent,
            documentExcerpt: payload.documentExcerpt,
            history,
            dialect,
          });
          const { user, assistant } = persistChatExchange(chatReply);
          const scope = payload.referenceScope ?? 'document';
          return okWritingIntent({
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
          });
        }

        const intent = await analyzeWritingIntentLocal(m, {
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
          return okWritingIntent(base);
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

        const chatReply = await generateWritingChatReplyLocal(m, {
          content: payload.content,
          chapterTitle: payload.chapterTitle,
          chapterContent: payload.chapterContent,
          documentExcerpt: payload.documentExcerpt,
          history,
          dialect,
        });
        const { user, assistant } = persistChatExchange(chatReply);
        return okWritingIntent({
          ...base,
          mode: 'chat',
          ready: true,
          displayText: chatReply,
          chatReply,
          user,
          assistant,
        });
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
        chapterContent: string;
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

      const action = pending.pendingAction ?? '润色';
      const instruction = pending.pendingInstruction ?? pending.content ?? '';

      try {
        const generated = await generateRevisionSnapshotLocal(await model(), {
          action,
          instruction,
          chapterContent: body.chapterContent,
        });
        const revision = store().createRevision({
          documentId,
          blockId: body.blockId,
          parentRevisionId: null,
          snapshot: generated.newText,
          previousSnapshot: body.chapterContent,
          summary: generated.comment,
          source: 'ai',
          status: 'pending',
          suggestAction: action,
          suggestInstruction: instruction,
        });
        store().updateWritingAssistantMessage(documentId, body.messageId, {
          confirmStatus: 'approved',
        });
        const assistant = store().addWritingAssistantMessage({
          documentId,
          role: 'assistant',
          content: generated.comment,
          kind: 'revision_ready',
          revisionId: revision.id,
          suggestAction: action,
        });
        if (!assistant) notFound('DOCUMENT_NOT_FOUND');
        deps.markChanged();
        return ok({
          assistant,
          revision,
          oldText: body.chapterContent,
          newText: generated.newText,
          comment: generated.comment,
          contextUsage: emptyContextUsage,
        });
      } catch (e) {
        rethrowAsApiError(e);
      }
    },

    aiSuggest: async (
      documentId: string,
      blockId: string,
      action: string,
      options?: { instruction?: string },
    ) => {
      const doc = store().getDocument(documentId);
      if (!doc) notFound('DOCUMENT_NOT_FOUND');
      const found = store().findBlock(documentId, blockId);
      if (!found) notFound('BLOCK_NOT_FOUND');
      const chapterContent = found.block.content;
      try {
        const generated = await generateRevisionSnapshotLocal(await model(), {
          action,
          instruction: options?.instruction ?? action,
          chapterContent,
        });
        const revision = store().createRevision({
          documentId,
          blockId,
          parentRevisionId: null,
          snapshot: generated.newText,
          previousSnapshot: chapterContent,
          summary: generated.comment,
          source: 'ai',
          status: 'pending',
          suggestAction: action,
          suggestInstruction: options?.instruction,
        });
        deps.markChanged();
        return ok({
          revision,
          oldText: chapterContent,
          newText: generated.newText,
          comment: generated.comment,
        });
      } catch (e) {
        rethrowAsApiError(e);
      }
    },

    getWritingAssistantContextUsage: async () => ok(emptyContextUsage),

    getWritingContextPreview: async () => ok(emptyContextPreview),

    getDeepSeekStatus: async () => {
      const key = await getDeepSeekApiKey();
      return ok({
        configured: Boolean(key),
        source: 'local',
        model: DEEPSEEK_MODEL_PRO,
        displayName: 'DeepSeek Pro',
      });
    },

    verifyDeepSeekKey: async (apiKey?: string) => {
      const key = apiKey?.trim() || (await getDeepSeekApiKey());
      if (!key) return ok({ valid: false, message: '请先填入密钥' });
      return ok(await verifyDeepSeekKeyDirect(key));
    },

    transcribeAudio: async (body: { audioBase64: string; format?: string }) => {
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
