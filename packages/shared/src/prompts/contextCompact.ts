import {
  COMPACT_SUMMARY_MAX_TOKENS,
  tokensToEstimatedChars,
} from '../llm/contextBudget.js';
import type { ReplyDialect } from './persona.js';

const SUMMARY_CHAR_BUDGET = tokensToEstimatedChars(COMPACT_SUMMARY_MAX_TOKENS);

const HISTORY_SUMMARY_MANDARIN = `你是上下文压缩助手。把以下多轮对话压缩成一段摘要，供后续对话继续参考。
要求：
- 摘要总篇幅不超过约 ${SUMMARY_CHAR_BUDGET} 个汉字（约 ${Math.round(COMPACT_SUMMARY_MAX_TOKENS / 1000)}k token），口语清楚，能长则尽量保留细节
- 保留：用户核心诉求、已确认的结论、未解决的问题、重要人名地名与时间线
- 不要编造对话里没有的内容
- 不要加标题或 markdown，只输出摘要正文`;

const HISTORY_SUMMARY_CANTONESE = `你是上下文压缩助手。把以下多轮对话压缩成一段摘要，供后续对话继续参考。
要求：
- 摘要总篇幅不超过约 ${SUMMARY_CHAR_BUDGET} 字（约 ${Math.round(COMPACT_SUMMARY_MAX_TOKENS / 1000)}k token），能长则尽量保留细节
- 保留用户核心诉求、已确认结论、未解决问题、重要人名地名
- 勿编造
- 只输出摘要正文`;

export function historyCompactPromptForDialect(dialect?: ReplyDialect | null): string {
  return dialect === 'cantonese' ? HISTORY_SUMMARY_CANTONESE : HISTORY_SUMMARY_MANDARIN;
}

const DOCUMENT_SUMMARY_MANDARIN = `你是文稿压缩助手。以下是一篇文章各章节内容，请压缩为「全篇理解用摘要」。
要求：
- 每章 1～3 句，章与章之间空一行
- 标出章节标题
- 当前待改章节可略详，其它章从简
- 不编造情节，总篇幅不超过约 ${SUMMARY_CHAR_BUDGET} 个汉字（约 ${Math.round(COMPACT_SUMMARY_MAX_TOKENS / 1000)}k token）
- 只输出摘要，不要 markdown`;

export function documentCompactPromptForDialect(_dialect?: ReplyDialect | null): string {
  return DOCUMENT_SUMMARY_MANDARIN;
}

export function formatHistoryForCompact(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): string {
  return messages
    .map((m) => {
      const label = m.role === 'user' ? '用户' : '小助手';
      return `${label}：${m.content.trim()}`;
    })
    .join('\n\n');
}
