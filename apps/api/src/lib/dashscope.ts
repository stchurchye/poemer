import {
  DashScopeError,
  qwen3AsrTranscribe,
  qwen3TtsSynthesize,
  verifyDashScopeKey,
} from '@shiren/shared';

export { DashScopeError, qwen3AsrTranscribe, qwen3TtsSynthesize, verifyDashScopeKey };

export function getDashScopeKeyFromRequest(headerKey?: string | null): string {
  const fromHeader = headerKey?.trim();
  if (fromHeader) return fromHeader;
  const fromEnv = process.env.DASHSCOPE_API_KEY?.trim();
  if (!fromEnv) throw new DashScopeError('DASHSCOPE_KEY_MISSING');
  return fromEnv;
}

export function hasDashScopeKeyConfigured(headerKey?: string | null): boolean {
  return Boolean(headerKey?.trim() || process.env.DASHSCOPE_API_KEY?.trim());
}
