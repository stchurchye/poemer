import {
  hasWritingExecuteBasis,
  parseWritingExecuteResponse,
  WRITING_EXECUTE_BASIS_ONLY_PROMPT,
  writingPersonaForDialect,
  type ReplyDialect,
  type WritingExecuteBasis,
} from '@shiren/shared';
import { chatCompletionRaw, type ChatMessageInput } from './deepseek.js';

export type WritingExecuteFallbackParams = {
  action: string;
  oldText: string;
  suggestedText: string;
  instruction?: string;
  dialect?: ReplyDialect;
};

/** 改稿主调用：解析正文 + 依据；若无依据则再调一次仅补 JSON */
export async function completeWritingExecuteRaw(
  apiKey: string,
  messages: ChatMessageInput[],
  fallback: WritingExecuteFallbackParams,
  options?: { maxTokens?: number; temperature?: number },
): Promise<{ text: string; basis: WritingExecuteBasis }> {
  const raw = await chatCompletionRaw(apiKey, messages, options);
  let { text, basis } = parseWritingExecuteResponse(raw);

  if (hasWritingExecuteBasis(basis)) {
    return { text, basis: basis! };
  }

  const filled = await fetchWritingExecuteBasisOnly(apiKey, {
    ...fallback,
    suggestedText: text || fallback.suggestedText,
  });
  return { text, basis: filled };
}

async function fetchWritingExecuteBasisOnly(
  apiKey: string,
  params: WritingExecuteFallbackParams,
): Promise<WritingExecuteBasis> {
  const userParts = [
    `改稿方式：${params.action}`,
    params.instruction?.trim() ? `用户要求：${params.instruction.trim()}` : '',
    `原文：\n${params.oldText || '（空）'}`,
    `改稿后正文：\n${params.suggestedText || '（空）'}`,
  ].filter(Boolean);

  const raw = await chatCompletionRaw(
    apiKey,
    [
      {
        role: 'system',
        content: `${writingPersonaForDialect(params.dialect)}\n\n${WRITING_EXECUTE_BASIS_ONLY_PROMPT}`,
      },
      { role: 'user', content: userParts.join('\n\n') },
    ],
    { temperature: 0.35, maxTokens: 512 },
  );

  const parsed = parseWritingExecuteResponse(raw);
  if (hasWritingExecuteBasis(parsed.basis)) {
    return parsed.basis!;
  }

  return {
    evaluation: '原文写得有感情，也有可以写得更清楚、更顺口的地方。',
    rationale: `已按「${params.action}」的要求改了一版，方便您对比看看是否合适。`,
  };
}
