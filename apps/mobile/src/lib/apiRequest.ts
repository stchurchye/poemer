import {
  networkErrorDetail,
  notifyApiReachable,
  notifyApiUnreachable,
} from './apiConnectivity';

export type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
  /** 失败后额外重试次数，默认 LLM 为 2、其它为 0 */
  retries?: number;
};

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly hint?: string,
    public readonly status?: number,
    public readonly retryable = false,
    public readonly requestId?: string,
    public readonly path?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function timeoutForPath(path: string): number {
  if (path.includes('/asr') || path.includes('/ocr')) return 90_000;
  if (path.includes('/assistant') || (path.includes('/chat/sessions') && path.includes('/messages'))) {
    return 120_000;
  }
  if (path.includes('/ai')) return 120_000;
  return 30_000;
}

function defaultRetries(path: string): number {
  if (
    path.includes('/assistant') ||
    (path.includes('/chat/sessions') && path.includes('/messages') && path.endsWith('/messages')) ||
    path.includes('/ai')
  ) {
    return 2;
  }
  if (path.includes('/asr') || path.includes('/ocr')) return 1;
  if (path === '/health') return 0;
  if (path.includes('/api/documents') || path.includes('/api/chat')) return 2;
  return 1;
}

function shouldRetry(err: unknown, status?: number): boolean {
  if (status != null && status >= 502 && status <= 504) return true;
  if (err instanceof ApiRequestError && err.retryable) return true;
  if (err instanceof Error) {
    if (err.name === 'AbortError') return true;
    if (err.message.includes('Network request failed')) return true;
  }
  return false;
}

export async function fetchJsonWithRetry<T>(
  url: string,
  options: ApiRequestOptions = {},
): Promise<{ ok: true; data: T; requestId: string }> {
  const path = new URL(url).pathname;
  const timeoutMs = options.timeoutMs ?? timeoutForPath(path);
  const maxRetries = options.retries ?? defaultRetries(path);
  const { timeoutMs: _t, retries: _r, ...fetchInit } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...fetchInit, signal: ac.signal });
      clearTimeout(timer);

      let json: {
        ok?: boolean;
        message?: string;
        hint?: string;
        code?: string;
        data?: T;
        requestId?: string;
        retryable?: boolean;
      };
      try {
        json = await res.json();
      } catch {
        const bad = networkErrorDetail('BAD_RESPONSE');
        throw new ApiRequestError(
          `${bad.message}（${res.status}）`,
          'BAD_RESPONSE',
          bad.hint,
          res.status,
          res.status >= 500,
        );
      }

      if (!json.ok) {
        const apiErr = new ApiRequestError(
          json.message ?? '出了点小问题，请稍后再试',
          json.code,
          json.hint,
          res.status,
          json.retryable ?? (res.status >= 500 || res.status === 429),
          json.requestId,
          path,
        );
        if (__DEV__) {
          console.warn('[api.error]', JSON.stringify({
            path,
            status: res.status,
            code: json.code,
            message: json.message,
            hint: json.hint,
            requestId: json.requestId,
            retryable: json.retryable,
          }));
        }
        throw apiErr;
      }

      notifyApiReachable();
      return {
        ok: true,
        data: json.data as T,
        requestId: json.requestId ?? '',
      };
    } catch (e) {
      clearTimeout(timer);
      lastError = e;

      if (e instanceof ApiRequestError && !e.retryable) throw e;

      const wrapped =
        e instanceof ApiRequestError
          ? e
          : e instanceof Error && e.name === 'AbortError'
            ? (() => {
                const t = networkErrorDetail('TIMEOUT');
                return new ApiRequestError(t.message, 'TIMEOUT', t.hint, undefined, true);
              })()
            : e instanceof TypeError
              ? (() => {
                  const n = networkErrorDetail('NETWORK');
                  return new ApiRequestError(n.message, 'NETWORK', n.hint, undefined, true);
                })()
              : e;

      if (
        attempt < maxRetries &&
        shouldRetry(wrapped, wrapped instanceof ApiRequestError ? wrapped.status : undefined)
      ) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        lastError = wrapped;
        continue;
      }

      if (wrapped instanceof ApiRequestError && (wrapped.code === 'NETWORK' || wrapped.code === 'TIMEOUT')) {
        notifyApiUnreachable();
      }

      throw wrapped instanceof ApiRequestError ? wrapped : e;
    }
  }

  throw lastError;
}
