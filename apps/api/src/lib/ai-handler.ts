import { ErrorCodes } from '@shiren/shared';
import type { Context } from 'hono';
import type { AppVariables } from '../types.js';
import { DeepSeekError, getApiKeyFromRequest } from './deepseek.js';
import { jsonError } from './errors.js';

export function getDeepSeekKey(c: Context<{ Variables: AppVariables }>): string {
  try {
    return getApiKeyFromRequest(c.req.header('X-DeepSeek-Api-Key'));
  } catch (e) {
    if (e instanceof DeepSeekError && e.message === 'API_KEY_MISSING') {
      throw e;
    }
    throw e;
  }
}

export function handleAiError(c: Context<{ Variables: AppVariables }>, e: unknown) {
  if (e instanceof Error && e.message.startsWith('CONTEXT_')) {
    const [, detail] = e.message.split(/:\s*/, 2);
    return c.json(
      {
        ok: false,
        message: detail || '正文或指令太长，请缩短后再试',
        hint: '原文保持不变。',
        code: ErrorCodes.VALIDATION,
        requestId: c.get('requestId'),
        retryable: false,
      },
      400,
    );
  }
  if (
    e instanceof Error &&
    (e as Error & { code?: string }).code === 'WRITING_OUTPUT_TRUNCATED'
  ) {
    return c.json(
      {
        ok: false,
        message: e.message,
        hint: '原文保持不变，没有生成不完整的替换稿。',
        code: ErrorCodes.VALIDATION,
        requestId: c.get('requestId'),
        retryable: false,
      },
      400,
    );
  }
  if (e instanceof DeepSeekError) {
    if (e.message === 'API_KEY_MISSING') {
      return jsonError(c, ErrorCodes.API_KEY_MISSING, 400);
    }
    if (e.status === 401 || e.status === 403) {
      return c.json(
        {
          ok: false,
          message: '密钥不对或已失效，请在「我的」里重新填写',
          hint: '请检查 DeepSeek 控制台里的密钥是否有效',
          code: 'DEEPSEEK_AUTH',
          requestId: c.get('requestId'),
          retryable: true,
        },
        401,
      );
    }
    return c.json(
      {
        ok: false,
        message: e.message || '小助手这会儿有点忙，请稍后再试',
        hint: '文稿还在，不会丢',
        code: ErrorCodes.AI_BUSY,
        requestId: c.get('requestId'),
        retryable: true,
      },
      502,
    );
  }
  return jsonError(c, ErrorCodes.SERVER_ERROR, 500);
}
