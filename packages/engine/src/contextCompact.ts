import {
  formatHistoryForCompact,
  getCompactSummaryMaxTokens,
  historyCompactPromptForDialect,
  documentCompactPromptForDialect,
  trimTextToTokenBudget,
  type ReplyDialect,
} from '@shiren/shared';
import type { ModelClient } from './modelClient.js';

export async function compactHistoryViaLlm(params: {
  model: ModelClient;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  existingSummary?: string | null;
  dialect?: ReplyDialect;
}): Promise<string> {
  if (params.messages.length === 0) {
    return params.existingSummary?.trim() ?? '';
  }

  const transcript = formatHistoryForCompact(params.messages);
  const existing = params.existingSummary?.trim();
  const userContent = existing
    ? `已有摘要：\n${existing}\n\n请把下面更早的对话合并进摘要（去重、保留关键信息）：\n\n${transcript}`
    : `请压缩以下对话：\n\n${transcript}`;

  const summaryMax = getCompactSummaryMaxTokens();
  const res = await params.model.complete({
    messages: [
      { role: 'system', content: historyCompactPromptForDialect(params.dialect) },
      { role: 'user', content: userContent },
    ],
    maxTokens: summaryMax,
    temperature: 0.2,
  });

  return trimTextToTokenBudget(res.text.trim(), summaryMax);
}

export async function compactDocumentExcerptViaLlm(params: {
  model: ModelClient;
  documentExcerpt: string;
  dialect?: ReplyDialect;
}): Promise<string> {
  const summaryMax = getCompactSummaryMaxTokens();
  const res = await params.model.complete({
    messages: [
      { role: 'system', content: documentCompactPromptForDialect(params.dialect) },
      { role: 'user', content: params.documentExcerpt },
    ],
    maxTokens: summaryMax,
    temperature: 0.2,
  });
  return trimTextToTokenBudget(res.text.trim(), summaryMax);
}
