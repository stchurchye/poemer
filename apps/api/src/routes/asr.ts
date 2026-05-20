import { Hono } from 'hono';
import { ErrorCodes, QWEN_ASR_MODEL, REPLY_DIALECT_HEADER } from '@shiren/shared';
import { parseReplyDialect } from '../lib/deepseek.js';
import { getDashScopeKey, handleDashScopeError } from '../lib/dashscope-handler.js';
import { DashScopeError, qwen3AsrTranscribe } from '../lib/dashscope.js';
import { jsonError } from '../lib/errors.js';
import type { AppVariables } from '../types.js';
import { log } from '../lib/logger.js';

export const asrRouter = new Hono<{ Variables: AppVariables }>();

asrRouter.post('/', async (c) => {
  const body = await c.req.json<{
    audioBase64?: string;
    format?: string;
  }>();

  const dialect = parseReplyDialect(c.req.header(REPLY_DIALECT_HEADER));

  log('info', 'asr.request', {
    requestId: c.get('requestId'),
    format: body.format ?? 'm4a',
    dialect,
    model: QWEN_ASR_MODEL,
    hasKey: Boolean(c.req.header('X-DashScope-Api-Key')?.trim() || process.env.DASHSCOPE_API_KEY),
  });

  const audioBase64 = body.audioBase64?.trim();
  if (!audioBase64 || audioBase64.length < 32) {
    return jsonError(c, ErrorCodes.VALIDATION, 400);
  }
  if (audioBase64.length > 25_000_000) {
    return jsonError(c, ErrorCodes.VALIDATION, 400);
  }

  try {
    const apiKey = getDashScopeKey(c);
    const text = await qwen3AsrTranscribe({
      apiKey,
      audioBase64,
      format: body.format ?? 'm4a',
      dialect,
    });
    if (!text) {
      return jsonError(c, ErrorCodes.ASR_EMPTY, 422);
    }
    log('info', 'asr.ok', { requestId: c.get('requestId'), chars: text.length, dialect });
    return c.json({ ok: true, data: { text }, requestId: c.get('requestId') });
  } catch (e) {
    if (e instanceof DashScopeError && e.message === 'DASHSCOPE_KEY_MISSING') {
      return jsonError(c, ErrorCodes.DASHSCOPE_KEY_MISSING, 400);
    }
    return handleDashScopeError(c, e);
  }
});
