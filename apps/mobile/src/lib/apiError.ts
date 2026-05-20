/** 从 API 抛出的 Error 里取出对用户友好的说明 */
export function apiErrorText(e: unknown): { message: string; hint?: string } {
  if (e instanceof Error) {
    const err = e as Error & {
      hint?: string;
      code?: string;
      requestId?: string;
      path?: string;
      status?: number;
    };
    const debugTail =
      typeof __DEV__ !== 'undefined' &&
      __DEV__ &&
      err.requestId
        ? `（错误码 ${err.code ?? '?'} · 编号 ${err.requestId}${err.path ? ` · ${err.path}` : ''}）`
        : undefined;
    const hintParts = [err.hint, debugTail].filter(Boolean);
    return {
      message: err.message || '出了点小问题，请稍后再试',
      hint: hintParts.length > 0 ? hintParts.join('\n') : undefined,
    };
  }
  return { message: '出了点小问题，请稍后再试' };
}
