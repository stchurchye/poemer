import type { WritingExecuteBasis } from '@shiren/shared';
import {
  completeWritingExecute as engineCompleteWritingExecute,
  type WritingExecuteFallbackParams,
} from '@shiren/engine';
import { chatCompletionRaw, type ChatMessageInput } from './deepseek.js';
import type { ModelClient } from '@shiren/engine';

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

export type { WritingExecuteFallbackParams };

/** 改稿主调用：解析正文 + 依据；若无依据则再调一次仅补 JSON */
export async function completeWritingExecuteRaw(
  apiKey: string,
  messages: ChatMessageInput[],
  fallback: WritingExecuteFallbackParams,
  options?: { maxTokens?: number; temperature?: number },
): Promise<{ text: string; basis: WritingExecuteBasis }> {
  return engineCompleteWritingExecute(modelFromApiKey(apiKey), messages, fallback, options);
}
