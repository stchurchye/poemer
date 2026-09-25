import {
  formatHistoryForCompact,
  estimateTokens,
  getCompactCompletionMaxTokens,
  getCompactSummaryMaxTokens,
  getContextWindowTokens,
  historyCompactPromptForDialect,
  documentCompactPromptForDialect,
  trimTextToTokenBudget,
  type ReplyDialect,
} from '@shiren/shared';
import type { ModelClient } from './modelClient.js';

const MAX_TRUNCATION_RETRIES = 4;
const MIN_RETRY_CHUNK_TOKENS = 128;
const MAX_CHUNK_TO_COMPLETION_RATIO = 16;

function prefixWithinTokenBudget(text: string, budget: number): string {
  if (budget <= 0 || !text) return '';
  if (estimateTokens(text) <= budget) return text;
  let low = 1;
  let high = text.length;
  let best = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (estimateTokens(text.slice(0, mid)) <= budget) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (
    best > 0 &&
    best < text.length &&
    text.charCodeAt(best - 1) >= 0xd800 &&
    text.charCodeAt(best - 1) <= 0xdbff &&
    text.charCodeAt(best) >= 0xdc00 &&
    text.charCodeAt(best) <= 0xdfff
  ) {
    best -= 1;
  }
  return text.slice(0, best);
}

async function compactTextInChunks(params: {
  model: ModelClient;
  source: string;
  systemPrompt: string;
  existingSummary?: string | null;
  modelId?: string | null;
  inputLimitTokens?: number;
  promptForChunk: (summary: string, chunk: string) => string;
}): Promise<string> {
  const inputLimit = params.inputLimitTokens ?? getContextWindowTokens(params.modelId);
  const configuredCompletion = getCompactCompletionMaxTokens(params.modelId);
  const completionMax = Math.min(configuredCompletion, Math.max(128, Math.floor(inputLimit / 4)));
  const maxInput = inputLimit - completionMax;
  const systemTokens = estimateTokens(params.systemPrompt);
  let summary = params.existingSummary?.trim() ?? '';
  let remaining = params.source;

  while (remaining) {
    let emptyPrompt = params.promptForChunk(summary, '');
    let chunkBudget = maxInput - systemTokens - estimateTokens(emptyPrompt);
    if (chunkBudget <= 0 && summary) {
      const summaryBudget = Math.max(0, Math.floor((maxInput - systemTokens) / 2));
      summary = trimTextToTokenBudget(summary, summaryBudget);
      emptyPrompt = params.promptForChunk(summary, '');
      chunkBudget = maxInput - systemTokens - estimateTokens(emptyPrompt);
    }
    if (chunkBudget <= 0) throw new Error('COMPACT_INPUT_BUDGET_TOO_SMALL');

    let retryChunkBudget = Math.min(
      chunkBudget,
      completionMax * MAX_CHUNK_TO_COMPLETION_RATIO,
    );
    let truncationRetries = 0;

    while (true) {
      const chunk = prefixWithinTokenBudget(remaining, retryChunkBudget);
      if (!chunk) throw new Error('COMPACT_INPUT_BUDGET_TOO_SMALL');
      const userContent = params.promptForChunk(summary, chunk);
      const res = await params.model.complete({
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: userContent },
        ],
        maxTokens: completionMax,
        temperature: 0.2,
      });
      if (res.finishReason === 'length') {
        const chunkTokens = estimateTokens(chunk);
        if (
          truncationRetries >= MAX_TRUNCATION_RETRIES ||
          chunkTokens <= MIN_RETRY_CHUNK_TOKENS
        ) {
          throw new Error(
            'CONTEXT_COMPACT_OUTPUT_TRUNCATED: 上下文摘要没有完整生成，请缩短内容后再试',
          );
        }
        retryChunkBudget = Math.max(
          MIN_RETRY_CHUNK_TOKENS,
          Math.floor(chunkTokens / 2),
        );
        truncationRetries += 1;
        continue;
      }
      if (!res.text.trim()) return '';
      summary = trimTextToTokenBudget(res.text.trim(), getCompactSummaryMaxTokens());
      remaining = remaining.slice(chunk.length);
      break;
    }
  }

  return summary;
}

export async function compactHistoryViaLlm(params: {
  model: ModelClient;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  existingSummary?: string | null;
  dialect?: ReplyDialect;
  /** 压缩模型 id，用于按真实输出上限 clamp completion maxTokens */
  modelId?: string | null;
  /** 测试/特殊模型可覆盖压缩调用的完整上下文窗口 */
  inputLimitTokens?: number;
}): Promise<string> {
  if (params.messages.length === 0) {
    return params.existingSummary?.trim() ?? '';
  }

  const transcript = formatHistoryForCompact(params.messages);
  return compactTextInChunks({
    model: params.model,
    source: transcript,
    systemPrompt: historyCompactPromptForDialect(params.dialect),
    existingSummary: params.existingSummary,
    modelId: params.modelId,
    inputLimitTokens: params.inputLimitTokens,
    promptForChunk: (summary, chunk) =>
      summary
        ? `已有摘要：\n${summary}\n\n请把下面后续发生的对话合并进摘要（按时间顺序去重、保留关键信息）：\n\n${chunk}`
        : `请压缩以下对话：\n\n${chunk}`,
  });
}

export async function compactDocumentExcerptViaLlm(params: {
  model: ModelClient;
  documentExcerpt: string;
  dialect?: ReplyDialect;
  modelId?: string | null;
  /** 测试/特殊模型可覆盖压缩调用的完整上下文窗口 */
  inputLimitTokens?: number;
}): Promise<string> {
  return compactTextInChunks({
    model: params.model,
    source: params.documentExcerpt,
    systemPrompt: documentCompactPromptForDialect(params.dialect),
    modelId: params.modelId,
    inputLimitTokens: params.inputLimitTokens,
    promptForChunk: (summary, chunk) =>
      summary
        ? `已有全篇摘要：\n${summary}\n\n请把下面尚未整理的文稿合并进摘要：\n\n${chunk}`
        : chunk,
  });
}
