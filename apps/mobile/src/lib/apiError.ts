import { errorMessages, type ErrorCode } from '@shiren/shared';
import {
  isConnectivityErrorCode,
  networkErrorDetail,
  networkErrorHint,
  shouldAppendNetworkHint,
} from './apiConnectivity';

function isKnownErrorCode(code: string): code is ErrorCode {
  return code in errorMessages;
}

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

    if (err.code && isKnownErrorCode(err.code)) {
      const entry = errorMessages[err.code];
      return {
        message: entry.message,
        hint: err.hint ?? entry.hint,
      };
    }

    let message = err.message || '出了点小问题，请稍后再试';
    let hint = err.hint;

    if (
      err.code?.startsWith('MODEL_') ||
      err.code === 'DASHSCOPE_KEY_MISSING' ||
      err.code === 'ZENMUX_KEY_MISSING' ||
      err.code === 'VENDOR_NETWORK' ||
      err.code === 'VENDOR_BAD_RESPONSE' ||
      err.code === 'ASR_EMPTY'
    ) {
      return {
        message,
        hint,
      };
    }

    if (isConnectivityErrorCode(err.code) && !hint) {
      const detail = networkErrorDetail(err.code);
      if (!message || message.includes('npm run dev:api') || message.includes('连不上')) {
        message = detail.message;
      }
      hint = detail.hint;
    }

    const debugTail =
      typeof __DEV__ !== 'undefined' &&
      __DEV__ &&
      err.requestId
        ? `（错误码 ${err.code ?? '?'} · 编号 ${err.requestId}${err.path ? ` · ${err.path}` : ''}）`
        : undefined;
    const hintParts = [hint, debugTail].filter(Boolean);
    return {
      message,
      hint: hintParts.length > 0 ? hintParts.join('\n') : undefined,
    };
  }
  return { message: '出了点小问题，请稍后再试' };
}

/** 列表/全屏加载失败时的一行说明 + 操作提示 */
export function apiLoadErrorText(e: unknown): { message: string; hint: string } {
  const { message, hint } = apiErrorText(e);
  const code = e instanceof Error ? (e as Error & { code?: string }).code : undefined;
  const fallback = shouldAppendNetworkHint(code) ? networkErrorHint() : '';
  return {
    message,
    hint: hint ?? fallback,
  };
}

/** 弹窗：标题 + 友好说明（含网络 hint） */
export function formatApiErrorAlertBody(e: unknown): string {
  const { message, hint } = apiErrorText(e);
  return hint ? `${message}\n\n${hint}` : message;
}
