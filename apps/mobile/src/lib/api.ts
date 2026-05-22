import type {
  Document,
  WritingUnderstandingScope,
} from '@shiren/shared';
import { createLocalApi } from './localApi';
import { getLocalApiRuntime } from './localApiRuntime';

const local = () => createLocalApi(getLocalApiRuntime());

export const api = {
  health: () => local().health(),

  listDocuments: () => local().listDocuments(),

  createDocument: (title: string) => local().createDocument(title),

  getDocument: (id: string) => local().getDocument(id),

  updateDocument: (id: string, patch: Partial<Document>) =>
    local().updateDocument(id, patch),

  addChapter: (documentId: string, title?: string) =>
    local().addChapter(documentId, title),

  listRevisions: (documentId: string) => local().listRevisions(documentId),

  getRevision: (documentId: string, revisionId: string) =>
    local().getRevision(documentId, revisionId),

  aiSuggest: (
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
    const instruction =
      options?.retry != null
        ? `${options.retry.baseInstruction}\n再改一版：${options.retry.additionalFeedback}`
        : options?.instruction;
    return local().aiSuggest(documentId, blockId, action, { instruction });
  },

  acceptRevision: (documentId: string, revisionId: string, editedSnapshot?: string) =>
    local().acceptRevision(documentId, revisionId, editedSnapshot),

  rejectRevision: (documentId: string, revisionId: string) =>
    local().rejectRevision(documentId, revisionId),

  rollback: (documentId: string, revisionId: string) =>
    local().rollback(documentId, revisionId),

  getWritingAssistantMessages: (documentId: string) =>
    local().getWritingAssistantMessages(documentId),

  analyzeWritingAssistantIntent: (
    documentId: string,
    payload: {
      content: string;
      articleExcerpt: string;
      chapterTitle: string;
      chapterContent: string;
      documentExcerpt: string;
      contextSelection?: import('@shiren/shared').ContextSelection;
      source?: 'text' | 'voice';
      directChat?: boolean;
      referenceScope?: WritingUnderstandingScope;
    },
  ) => local().analyzeWritingAssistantIntent(documentId, payload),

  sendWritingAssistantMessage: (
    documentId: string,
    payload: {
      content: string;
      articleExcerpt: string;
      chapterId: string;
      chapterTitle: string;
      chapterContent: string;
      documentExcerpt: string;
      contextSelection?: import('@shiren/shared').ContextSelection;
      commitIntent: {
        displayText: string;
        action: string;
        instruction: string;
      };
      contextUsage?: import('@shiren/shared').ContextUsage;
    },
  ) => local().sendWritingAssistantMessage(documentId, payload),

  confirmWritingAssistant: (
    documentId: string,
    body: {
      messageId: string;
      approved: boolean;
      blockId: string;
      articleExcerpt: string;
      chapterId: string;
      chapterTitle: string;
      chapterContent: string;
      documentExcerpt: string;
      understandingScope: WritingUnderstandingScope;
    },
  ) => local().confirmWritingAssistant(documentId, body),

  getWritingAssistantContextUsage: (
    _documentId: string,
    _params: {
      chapterTitle: string;
      chapterContent: string;
      documentExcerpt: string;
      pending?: string;
      contextSelection?: import('@shiren/shared').ContextSelection;
    },
  ) => local().getWritingAssistantContextUsage(),

  getWritingContextPreview: (
    _documentId: string,
    _params: {
      chapterTitle: string;
      chapterContent: string;
      documentExcerpt: string;
      pending?: string;
      contextSelection?: import('@shiren/shared').ContextSelection;
    },
  ) => local().getWritingContextPreview(),

  listChatSessions: () => local().listChatSessions(),

  createChatSession: (title?: string) => local().createChatSession(title),

  getChatMessages: (sessionId: string) => local().getChatMessages(sessionId),

  getChatContextUsage: (
    _sessionId: string,
    _params?: { pending?: string; contextSelection?: import('@shiren/shared').ContextSelection },
  ) => local().getChatContextUsage(),

  getChatContextPreview: (
    _sessionId: string,
    _params?: { pending?: string; contextSelection?: import('@shiren/shared').ContextSelection },
  ) => local().getChatContextPreview(),

  compactChatSession: (sessionId: string) => local().compactChatSession(sessionId),

  analyzeChatIntent: (sessionId: string, body: { content: string; source?: 'text' | 'voice' }) =>
    local().analyzeChatIntent(sessionId, body),

  sendChatMessage: (
    sessionId: string,
    body: {
      content: string;
      images?: Array<{ imageBase64: string; mimeType?: string }>;
      contextSelection?: import('@shiren/shared').ContextSelection;
    },
  ) => local().sendChatMessage(sessionId, body),

  getDeepSeekStatus: () => local().getDeepSeekStatus(),

  verifyDeepSeekKey: (apiKey?: string) => local().verifyDeepSeekKey(apiKey),

  ocrImage: (body: { imageBase64: string; mimeType?: string; purpose?: string }) =>
    local().ocrImage(body),

  transcribeAudio: (body: { audioBase64: string; format?: string }) =>
    local().transcribeAudio(body),

  getZenMuxStatus: () => local().getZenMuxStatus(),

  verifyZenMuxKey: (apiKey?: string) => local().verifyZenMuxKey(apiKey),

  getDashScopeStatus: () => local().getDashScopeStatus(),

  verifyDashScopeKey: (apiKey?: string) => local().verifyDashScopeKey(apiKey),

  synthesizeSpeech: (body: { text: string; voice?: string; dialect?: 'mandarin' | 'cantonese' }) =>
    local().synthesizeSpeech(body),
};
