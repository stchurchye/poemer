import type { ContextSelection, ContextPreview, ContextUsage, ReplyDialect } from '@shiren/shared';
import {
  prepareChatContext as enginePrepareChatContext,
  previewChatContextPreview as enginePreviewChatContextPreview,
  previewChatContextUsage as enginePreviewChatContextUsage,
  compactChatSession as engineCompactChatSession,
  prepareWritingIntentContext as enginePrepareWritingIntentContext,
  prepareWritingChatContext as enginePrepareWritingChatContext,
  previewWritingIntentContextPreview as enginePreviewWritingIntentContextPreview,
  previewWritingIntentContextUsage as enginePreviewWritingIntentContextUsage,
  prepareWritingExecuteContext as enginePrepareWritingExecuteContext,
  type ChatMessageInput,
  type ContextStoreAdapter,
  type ModelClient,
  type PreparedChatContext,
  type PreparedWritingIntentContext,
} from '@shiren/engine';
import { chatCompletionRaw } from './deepseek.js';
import {
  getChatMessages,
  getChatSession,
  getDocument,
  getWritingAssistantMessages,
  updateChatSessionContext,
  updateDocumentContextFields,
} from '../store/db.js';

export type { ChatMessageInput, PreparedChatContext, PreparedWritingIntentContext };

const storeAdapter: ContextStoreAdapter = {
  getChatSession,
  getChatMessages,
  updateChatSessionContext,
  getDocument,
  getWritingAssistantMessages,
  updateDocumentContextFields,
};

function modelFromApiKey(apiKey: string): ModelClient {
  return {
    async complete(input) {
      const text = await chatCompletionRaw(apiKey, input.messages as ChatMessageInput[], {
        maxTokens: input.maxTokens,
        temperature: input.temperature,
      });
      return { text };
    },
  };
}

export async function prepareChatContext(params: {
  apiKey: string;
  sessionId: string;
  pendingUser: string;
  dialect?: ReplyDialect;
  contextSelection?: ContextSelection;
}): Promise<PreparedChatContext> {
  return enginePrepareChatContext({
    store: storeAdapter,
    model: modelFromApiKey(params.apiKey),
    sessionId: params.sessionId,
    pendingUser: params.pendingUser,
    dialect: params.dialect,
    contextSelection: params.contextSelection,
  });
}

export async function previewChatContextPreview(params: {
  sessionId: string;
  pendingUser?: string;
  dialect?: ReplyDialect;
  contextSelection?: ContextSelection;
}): Promise<ContextPreview> {
  return enginePreviewChatContextPreview({ store: storeAdapter, ...params });
}

export async function previewChatContextUsage(params: {
  sessionId: string;
  pendingUser?: string;
  dialect?: ReplyDialect;
  contextSelection?: ContextSelection;
}): Promise<ContextUsage> {
  return enginePreviewChatContextUsage({ store: storeAdapter, ...params });
}

export async function compactChatSession(params: {
  apiKey: string;
  sessionId: string;
  dialect?: ReplyDialect;
}): Promise<{ confirmation: string; usage: ContextUsage }> {
  return engineCompactChatSession({
    store: storeAdapter,
    model: modelFromApiKey(params.apiKey),
    sessionId: params.sessionId,
    dialect: params.dialect,
  });
}

export async function prepareWritingIntentContext(
  params: Omit<
    Parameters<typeof enginePrepareWritingIntentContext>[0],
    'store' | 'model'
  > & { apiKey: string },
): Promise<PreparedWritingIntentContext> {
  const { apiKey, ...rest } = params;
  return enginePrepareWritingIntentContext({
    store: storeAdapter,
    model: modelFromApiKey(apiKey),
    ...rest,
  });
}

export async function prepareWritingChatContext(
  params: Omit<
    Parameters<typeof enginePrepareWritingChatContext>[0],
    'store' | 'model'
  > & { apiKey: string },
): Promise<PreparedWritingIntentContext> {
  const { apiKey, ...rest } = params;
  return enginePrepareWritingChatContext({
    store: storeAdapter,
    model: modelFromApiKey(apiKey),
    ...rest,
  });
}

export async function previewWritingIntentContextPreview(
  params: Parameters<typeof enginePreviewWritingIntentContextPreview>[0],
): Promise<ContextPreview> {
  return enginePreviewWritingIntentContextPreview(params);
}

export async function previewWritingIntentContextUsage(
  params: Parameters<typeof enginePreviewWritingIntentContextUsage>[0],
): Promise<ContextUsage> {
  return enginePreviewWritingIntentContextUsage(params);
}

export { enginePrepareWritingExecuteContext as prepareWritingExecuteContext };
