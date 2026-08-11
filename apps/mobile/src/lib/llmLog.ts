/**
 * LLM 调用诊断日志（仅内存，App 重启清空）。
 *
 * 目的：真机上区分「欠费 / 密钥失效 / V4 thinking 正文为空」这三类外观相同的失败。
 * 只记元数据 + 平台返回的 error 原文，不记你的文章/提示词正文，密钥也不入库。
 * 在「设置 → LLM 诊断日志」里查看并复制。
 */

import type { ModelTokenUsage } from '@shiren/shared';

export type LlmProvider = 'deepseek' | 'zenmux' | 'dashscope';

export type LlmLogEntry = {
  /** ISO 时间戳 */
  ts: string;
  /** 功能标签，如「DeepSeek·意图/改稿」「ZenMux·问问题正文」 */
  label: string;
  provider: LlmProvider;
  model?: string;
  /** 本次调用整体是否成功 */
  ok: boolean;
  /** HTTP 状态码（拿得到时）；402/insufficient=欠费，401/403=密钥/权限 */
  status?: number;
  durationMs?: number;
  /** 返回正文 content 的长度 */
  contentLen?: number;
  /** content 为空但有 reasoning_content → thinking 吃光正文，非欠费 */
  reasoningOnly?: boolean;
  errorCode?: string;
  /** 平台返回的 error.message 原文（截断），区分欠费/密钥的关键 */
  errorMessage?: string;
  /** 平台返回的真实 token 用量（拿得到时）；用于核对估算、验证缓存命中 */
  usage?: ModelTokenUsage;
};

const buffer: LlmLogEntry[] = [];
const MAX = 100;
const MAX_ERR_LEN = 400;

export function truncateError(msg: unknown): string | undefined {
  if (msg == null) return undefined;
  const s = String(msg);
  return s.length > MAX_ERR_LEN ? `${s.slice(0, MAX_ERR_LEN)}…` : s;
}

/** 把真实用量拼成一行：`in=… out=… cache_hit=… cache_miss=…`；全空返回 undefined */
export function formatUsageLine(usage?: ModelTokenUsage): string | undefined {
  if (!usage) return undefined;
  const parts: string[] = [];
  if (usage.promptTokens != null) parts.push(`in=${usage.promptTokens}`);
  if (usage.completionTokens != null) parts.push(`out=${usage.completionTokens}`);
  if (usage.cacheHitTokens != null) parts.push(`cache_hit=${usage.cacheHitTokens}`);
  if (usage.cacheMissTokens != null) parts.push(`cache_miss=${usage.cacheMissTokens}`);
  if (usage.cacheWriteTokens != null) parts.push(`cache_write=${usage.cacheWriteTokens}`);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

export function logLlmCall(entry: Omit<LlmLogEntry, 'ts'>): void {
  buffer.push({ ts: new Date().toISOString(), ...entry });
  if (buffer.length > MAX) buffer.shift();
}

type LlmCallBase = {
  label: string;
  provider: LlmProvider;
  model?: string;
  status?: number;
  /** Date.now() 起点，由助手算出 durationMs */
  startedAt: number;
};

/** 记一次成功调用 */
export function logLlmSuccess(
  args: LlmCallBase & { contentLen?: number; usage?: ModelTokenUsage },
): void {
  logLlmCall({
    label: args.label,
    provider: args.provider,
    model: args.model,
    ok: true,
    status: args.status,
    durationMs: Date.now() - args.startedAt,
    contentLen: args.contentLen,
    usage: args.usage,
  });
}

/** 记一次失败调用；errorMessage 传原始值即可，内部自动截断 */
export function logLlmFailure(
  args: LlmCallBase & {
    contentLen?: number;
    reasoningOnly?: boolean;
    errorCode?: string;
    errorMessage?: unknown;
  },
): void {
  logLlmCall({
    label: args.label,
    provider: args.provider,
    model: args.model,
    ok: false,
    status: args.status,
    durationMs: Date.now() - args.startedAt,
    contentLen: args.contentLen,
    reasoningOnly: args.reasoningOnly,
    errorCode: args.errorCode,
    errorMessage: truncateError(args.errorMessage),
  });
}

/** 最新在前 */
export function getLlmLogEntries(): LlmLogEntry[] {
  return buffer.slice().reverse();
}

export function clearLlmLogs(): void {
  buffer.length = 0;
}

/** 整理成可复制/分享的纯文本 */
export function formatLlmLogsText(): string {
  if (buffer.length === 0) return '（暂无 LLM 调用记录，请先在 App 里复现一次「没响应」）';
  return getLlmLogEntries()
    .map((e) => {
      const head = `[${e.ts}] ${e.ok ? '✓' : '✗'} ${e.label} · ${e.provider}${
        e.model ? `/${e.model}` : ''
      }`;
      const lines = [
        head,
        `  status=${e.status ?? '-'} ok=${e.ok}${
          e.durationMs != null ? ` ${e.durationMs}ms` : ''
        }`,
      ];
      if (e.contentLen != null) {
        lines.push(
          `  contentLen=${e.contentLen}${e.reasoningOnly ? ' ← 只有思考内容、正文为空（疑似 thinking，非欠费）' : ''}`,
        );
      }
      const usageLine = formatUsageLine(e.usage);
      if (usageLine) {
        lines.push(`  tokens: ${usageLine}`);
      }
      if (e.errorCode || e.errorMessage) {
        lines.push(`  error[${e.errorCode ?? ''}]: ${e.errorMessage ?? ''}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}
