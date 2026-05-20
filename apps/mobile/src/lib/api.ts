import type {
  ChatMessage,
  ChatSession,
  ContextPreview,
  ContextSelection,
  ContextUsage,
  Document,
  Revision,
  WritingAssistantMessage,
} from '@shiren/shared';
import { API_BASE_URL } from './config';
import { ApiRequestError, fetchJsonWithRetry } from './apiRequest';
import { getDeepSeekApiKey } from './deepseekKey';
import { getZenMuxApiKey } from './zenmuxKey';
import { getDashScopeApiKey } from './dashscopeKey';
import { getStoredDialect } from './tts';
import {
  REPLY_DIALECT_HEADER,
  type WritingUnderstandingScope,
} from '@shiren/shared';

export { ApiRequestError };

function contextSelectionQuery(sel?: ContextSelection): string {
  if (!sel) return '';
  const parts: string[] = [];
  if (sel.excludedMessageIds !== undefined) {
    parts.push(`excludedIds=${encodeURIComponent(sel.excludedMessageIds.join(','))}`);
  }
  if (sel.excludedBlockIds !== undefined) {
    parts.push(`excludedBlockIds=${encodeURIComponent(sel.excludedBlockIds.join(','))}`);
  }
  if (parts.length === 0) return '';
  return parts.length ? `&${parts.join('&')}` : '';
}

async function authHeaders(): Promise<Record<string, string>> {
  const [deepseek, zenmux, dashscope, dialect] = await Promise.all([
    getDeepSeekApiKey(),
    getZenMuxApiKey(),
    getDashScopeApiKey(),
    getStoredDialect(),
  ]);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (deepseek) headers['X-DeepSeek-Api-Key'] = deepseek;
  if (zenmux) headers['X-ZenMux-Api-Key'] = zenmux;
  if (dashscope) headers['X-DashScope-Api-Key'] = dashscope;
  headers[REPLY_DIALECT_HEADER] = dialect;
  return headers;
}

function networkErrorMessage(): string {
  return `连不上小助手服务（${API_BASE_URL}）。请在本机终端运行：npm run dev:api`;
}

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<{ ok: true; data: T; requestId: string }> {
  const baseHeaders = await authHeaders();
  const url = `${API_BASE_URL}${path}`;

  try {
    return await fetchJsonWithRetry<T>(url, {
      ...options,
      headers: {
        ...baseHeaders,
        ...(options?.headers as Record<string, string>),
      },
    });
  } catch (e) {
    if (e instanceof ApiRequestError) {
      const err = new Error(e.message) as Error & {
        hint?: string;
        code?: string;
        requestId?: string;
        status?: number;
        path?: string;
      };
      err.hint = e.hint;
      err.code = e.code;
      err.requestId = e.requestId;
      err.status = e.status;
      err.path = e.path;
      throw err;
    }
    throw new Error(networkErrorMessage());
  }
}

export const api = {
  health: () => request<{ service: string }>('/health'),

  listDocuments: () => request<Document[]>('/api/documents'),

  createDocument: (title: string) =>
    request<Document>('/api/documents', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),

  getDocument: (id: string) => request<Document>(`/api/documents/${id}`),

  updateDocument: (id: string, patch: Partial<Document>) =>
    request<Document>(`/api/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  addChapter: (documentId: string, title?: string) =>
    request<Document>(`/api/documents/${documentId}/chapters`, {
      method: 'POST',
      body: JSON.stringify(title ? { title } : {}),
    }),

  listRevisions: (documentId: string) =>
    request<Revision[]>(`/api/documents/${documentId}/revisions`),

  getRevision: (documentId: string, revisionId: string) =>
    request<Revision>(`/api/documents/${documentId}/revisions/${revisionId}`),

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
  ) =>
    request<{
      revision: Revision;
      oldText: string;
      newText: string;
      comment: string;
    }>(`/api/documents/${documentId}/ai`, {
      method: 'POST',
      body: JSON.stringify({
        blockId,
        action,
        instruction: options?.instruction,
        retry: options?.retry,
      }),
    }),

  acceptRevision: (
    documentId: string,
    revisionId: string,
    editedSnapshot?: string,
  ) =>
    request<Document>(`/api/documents/${documentId}/revisions/${revisionId}/accept`, {
      method: 'POST',
      body: JSON.stringify(
        editedSnapshot != null ? { editedSnapshot } : {},
      ),
    }),

  rejectRevision: (documentId: string, revisionId: string) =>
    request<Revision>(`/api/documents/${documentId}/revisions/${revisionId}/reject`, {
      method: 'POST',
    }),

  rollback: (documentId: string, revisionId: string) =>
    request<Revision>(`/api/documents/${documentId}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ revisionId }),
    }),

  getWritingAssistantMessages: (documentId: string) =>
    request<WritingAssistantMessage[]>(`/api/documents/${documentId}/assistant/messages`),

  analyzeWritingAssistantIntent: (
    documentId: string,
    payload: {
      content: string;
      articleExcerpt: string;
      chapterTitle: string;
      chapterContent: string;
      documentExcerpt: string;
      contextSelection?: ContextSelection;
      source?: 'text' | 'voice';
      directChat?: boolean;
      referenceScope?: import('@shiren/shared').WritingUnderstandingScope;
    },
  ) =>
    request<
      import('@shiren/shared').WritingIntentAnalyzeResult & {
        contextUsage: ContextUsage;
      }
    >(`/api/documents/${documentId}/assistant/intent`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  sendWritingAssistantMessage: (
    documentId: string,
    payload: {
      content: string;
      articleExcerpt: string;
      chapterId: string;
      chapterTitle: string;
      chapterContent: string;
      documentExcerpt: string;
      contextSelection?: ContextSelection;
      commitIntent: {
        displayText: string;
        action: string;
        instruction: string;
      };
      contextUsage?: ContextUsage;
    },
  ) =>
    request<{
      user: WritingAssistantMessage;
      assistant: WritingAssistantMessage;
      contextUsage: ContextUsage;
    }>(`/api/documents/${documentId}/assistant/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

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
  ) =>
    request<{
      assistant?: WritingAssistantMessage;
      revision?: Revision;
      oldText?: string;
      newText?: string;
      comment?: string;
      contextUsage?: ContextUsage;
    }>(`/api/documents/${documentId}/assistant/confirm`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getWritingAssistantContextUsage: (
    documentId: string,
    params: {
      chapterTitle: string;
      chapterContent: string;
      documentExcerpt: string;
      pending?: string;
      contextSelection?: ContextSelection;
    },
  ) =>
    request<ContextUsage>(`/api/documents/${documentId}/assistant/context-usage`, {
      method: 'POST',
      body: JSON.stringify({
        chapterTitle: params.chapterTitle,
        chapterContent: params.chapterContent,
        documentExcerpt: params.documentExcerpt,
        pending: params.pending?.trim() || undefined,
        contextSelection: params.contextSelection,
      }),
    }),

  getWritingContextPreview: (
    documentId: string,
    params: {
      chapterTitle: string;
      chapterContent: string;
      documentExcerpt: string;
      pending?: string;
      contextSelection?: ContextSelection;
    },
  ) =>
    request<ContextPreview>(`/api/documents/${documentId}/assistant/context-preview`, {
      method: 'POST',
      body: JSON.stringify({
        chapterTitle: params.chapterTitle,
        chapterContent: params.chapterContent,
        documentExcerpt: params.documentExcerpt,
        pending: params.pending?.trim() || undefined,
        contextSelection: params.contextSelection,
      }),
    }),

  listChatSessions: () => request<ChatSession[]>('/api/chat/sessions'),

  createChatSession: (title?: string) =>
    request<ChatSession>('/api/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),

  getChatMessages: (sessionId: string) =>
    request<ChatMessage[]>(`/api/chat/sessions/${sessionId}/messages`),

  getChatContextUsage: (
    sessionId: string,
    params?: { pending?: string; contextSelection?: ContextSelection },
  ) => {
    const parts: string[] = [];
    if (params?.pending?.trim()) {
      parts.push(`pending=${encodeURIComponent(params.pending.trim())}`);
    }
    const sel = contextSelectionQuery(params?.contextSelection);
    if (sel.startsWith('&')) parts.push(sel.slice(1));
    const q = parts.length ? `?${parts.join('&')}` : '';
    return request<ContextUsage>(`/api/chat/sessions/${sessionId}/context-usage${q}`);
  },

  getChatContextPreview: (
    sessionId: string,
    params?: { pending?: string; contextSelection?: ContextSelection },
  ) => {
    const parts: string[] = [];
    if (params?.pending?.trim()) {
      parts.push(`pending=${encodeURIComponent(params.pending.trim())}`);
    }
    const sel = contextSelectionQuery(params?.contextSelection);
    if (sel.startsWith('&')) parts.push(sel.slice(1));
    const q = parts.length ? `?${parts.join('&')}` : '';
    return request<ContextPreview>(`/api/chat/sessions/${sessionId}/context-preview${q}`);
  },

  compactChatSession: (sessionId: string) =>
    request<{
      confirmation: string;
      assistantMessage: ChatMessage;
      contextUsage: ContextUsage;
    }>(`/api/chat/sessions/${sessionId}/compact`, { method: 'POST' }),

  analyzeChatIntent: (
    sessionId: string,
    body: { content: string; source?: 'text' | 'voice' },
  ) =>
    request<import('@shiren/shared').ChatIntentAnalyzeResult>(
      `/api/chat/sessions/${sessionId}/intent`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),

  sendChatMessage: (
    sessionId: string,
    body: {
      content: string;
      images?: Array<{ imageBase64: string; mimeType?: string }>;
      contextSelection?: ContextSelection;
    },
  ) =>
    request<{
      user: ChatMessage;
      assistant: ChatMessage;
      session?: ChatSession;
      contextUsage: ContextUsage;
    }>(`/api/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getDeepSeekStatus: () =>
    request<{
      configured: boolean;
      source: string;
      model: string;
      displayName: string;
    }>('/api/settings/deepseek'),

  verifyDeepSeekKey: (apiKey?: string) =>
    request<{ valid: boolean; message: string }>('/api/settings/deepseek/verify', {
      method: 'POST',
      ...(apiKey ? { headers: { 'X-DeepSeek-Api-Key': apiKey } } : {}),
    }),

  ocrImage: (body: { imageBase64: string; mimeType?: string; purpose?: string }) =>
    request<{ text: string }>('/api/ocr', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  transcribeAudio: (body: { audioBase64: string; format?: string }) =>
    request<{ text: string }>('/api/asr', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getZenMuxStatus: () =>
    request<{
      configured: boolean;
      source: string;
      model: string;
      displayName: string;
    }>('/api/settings/zenmux'),

  verifyZenMuxKey: (apiKey?: string) =>
    request<{ valid: boolean; message: string }>('/api/settings/zenmux/verify', {
      method: 'POST',
      ...(apiKey ? { headers: { 'X-ZenMux-Api-Key': apiKey } } : {}),
    }),

  getDashScopeStatus: () =>
    request<{
      configured: boolean;
      source: string;
      model: string;
      displayName: string;
    }>('/api/settings/dashscope'),

  verifyDashScopeKey: (apiKey?: string) =>
    request<{ valid: boolean; message: string }>('/api/settings/dashscope/verify', {
      method: 'POST',
      ...(apiKey ? { headers: { 'X-DashScope-Api-Key': apiKey } } : {}),
    }),

  synthesizeSpeech: (body: { text: string; voice?: string; dialect?: 'mandarin' | 'cantonese' }) =>
    request<{ audioUrl: string; audioBase64: string }>('/api/tts', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
