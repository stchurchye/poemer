import { Hono } from 'hono';
import type { AppVariables } from '../types.js';
import { jsonError } from '../lib/errors.js';
import { log } from '../lib/logger.js';
import {
  deepseekChatIntentFromMessages,
  summarizeChatSessionTitle,
  parseReplyDialect,
} from '../lib/deepseek.js';
import { getDeepSeekKey, handleAiError } from '../lib/ai-handler.js';
import {
  compactChatSession,
  prepareChatContext,
  previewChatContextPreview,
  previewChatContextUsage,
} from '../lib/contextPipeline.js';
import {
  parseContextSelectionFromBody,
  parseContextSelectionFromQuery,
} from '../lib/contextSelectionParse.js';
import {
  addChatMessage,
  createChatSession,
  getChatMessages,
  listChatSessions,
  updateChatSessionTitle,
} from '../store/db.js';
import {
  chatIntentPromptForDialect,
  formatChatIntentUserPayload,
  ErrorCodes,
  REPLY_DIALECT_HEADER,
  CHAT_MAX_IMAGES_PER_MESSAGE,
  chatImageTurnLlmNotice,
  chatPendingUserForContext,
  chatStoredUserContent,
  ZENMUX_MODEL_CHAT,
  zenmuxCompleteMessages,
} from '@shiren/shared';
import { getZenMuxKey, handleZenMuxError } from '../lib/zenmux-handler.js';
import { zenmuxChatWithImages, ZenMuxError, type ZenMuxChatImage } from '../lib/zenmux.js';

export const chatRouter = new Hono<{ Variables: AppVariables }>();

chatRouter.get('/sessions', (c) => {
  return c.json({ ok: true, data: listChatSessions(), requestId: c.get('requestId') });
});

chatRouter.post('/sessions', async (c) => {
  const body = await c.req.json<{ title?: string }>();
  const session = createChatSession(body.title?.trim() || '和小助手聊聊');
  return c.json({ ok: true, data: session, requestId: c.get('requestId') }, 201);
});

chatRouter.get('/sessions/:id/messages', (c) => {
  const messages = getChatMessages(c.req.param('id'));
  if (messages.length === 0 && !listChatSessions().find((s) => s.id === c.req.param('id'))) {
    return jsonError(c, ErrorCodes.NOT_FOUND, 404);
  }
  return c.json({ ok: true, data: messages, requestId: c.get('requestId') });
});

chatRouter.get('/sessions/:id/context-usage', async (c) => {
  const sessionId = c.req.param('id');
  if (!listChatSessions().find((s) => s.id === sessionId)) {
    return jsonError(c, ErrorCodes.NOT_FOUND, 404);
  }
  const pending = c.req.query('pending') ?? '';
  const dialect = parseReplyDialect(c.req.header(REPLY_DIALECT_HEADER));
  const contextSelection = parseContextSelectionFromQuery(c);
  try {
    const usage = await previewChatContextUsage({
      sessionId,
      pendingUser: pending,
      dialect,
      contextSelection,
    });
    return c.json({ ok: true, data: usage, requestId: c.get('requestId') });
  } catch (e) {
    return jsonError(c, ErrorCodes.NOT_FOUND, 404);
  }
});

chatRouter.get('/sessions/:id/context-preview', async (c) => {
  const sessionId = c.req.param('id');
  if (!listChatSessions().find((s) => s.id === sessionId)) {
    return jsonError(c, ErrorCodes.NOT_FOUND, 404);
  }
  const pending = c.req.query('pending') ?? '';
  const dialect = parseReplyDialect(c.req.header(REPLY_DIALECT_HEADER));
  const contextSelection = parseContextSelectionFromQuery(c);
  try {
    const data = await previewChatContextPreview({
      sessionId,
      pendingUser: pending,
      dialect,
      contextSelection,
    });
    return c.json({ ok: true, data, requestId: c.get('requestId') });
  } catch (e) {
    return jsonError(c, ErrorCodes.NOT_FOUND, 404);
  }
});

chatRouter.post('/sessions/:id/compact', async (c) => {
  const sessionId = c.req.param('id');
  if (!listChatSessions().find((s) => s.id === sessionId)) {
    return jsonError(c, ErrorCodes.NOT_FOUND, 404);
  }
  let apiKey: string;
  try {
    apiKey = getDeepSeekKey(c);
  } catch (e) {
    return handleAiError(c, e);
  }
  const dialect = parseReplyDialect(c.req.header(REPLY_DIALECT_HEADER));
  try {
    const { confirmation, usage } = await compactChatSession({
      apiKey,
      sessionId,
      dialect,
    });
    const assistantMsg = addChatMessage(sessionId, 'assistant', confirmation)!;
    return c.json({
      ok: true,
      data: { confirmation, assistantMessage: assistantMsg, contextUsage: usage },
      requestId: c.get('requestId'),
    });
  } catch (e) {
    return handleAiError(c, e);
  }
});

chatRouter.post('/sessions/:id/intent', async (c) => {
  const sessionId = c.req.param('id');
  const body = await c.req.json<{ content?: string; source?: 'text' | 'voice' }>();
  const content = body.content?.trim();
  if (!content) return jsonError(c, ErrorCodes.VALIDATION, 400);

  if (!listChatSessions().find((s) => s.id === sessionId)) {
    return jsonError(c, ErrorCodes.NOT_FOUND, 404);
  }

  let apiKey: string;
  try {
    apiKey = getDeepSeekKey(c);
  } catch (e) {
    return handleAiError(c, e);
  }

  const dialect = parseReplyDialect(c.req.header(REPLY_DIALECT_HEADER));
  const source = body.source === 'voice' ? 'voice' : 'text';
  const recent = getChatMessages(sessionId)
    .slice(-4)
    .map((m) => `${m.role === 'user' ? '用户' : '小助手'}：${m.content.trim()}`);

  const messages = [
    { role: 'system' as const, content: chatIntentPromptForDialect(dialect) },
    {
      role: 'user' as const,
      content: formatChatIntentUserPayload({ recentLines: recent, currentContent: content, source }),
    },
  ];

  try {
    const intent = await deepseekChatIntentFromMessages(apiKey, messages);
    log('info', 'chat.intent', {
      sessionId,
      dialect,
      ready: intent.ready,
      guide: intent.guide,
      chars: intent.displayText.length,
      requestId: c.get('requestId'),
    });
    if (intent.guide) {
      return c.json({
        ok: true,
        data: {
          displayText: intent.displayText?.trim() ?? '',
          sendContent: '',
          ready: false,
          guide: intent.guide,
          transcript: source === 'voice' ? content : undefined,
          source,
        },
        requestId: c.get('requestId'),
      });
    }
    return c.json({
      ok: true,
      data: {
        displayText: intent.displayText,
        sendContent: intent.sendContent,
        ready: intent.ready,
        transcript: source === 'voice' ? content : undefined,
        source,
      },
      requestId: c.get('requestId'),
    });
  } catch (e) {
    return handleAiError(c, e);
  }
});

function parseChatImages(raw: unknown): ZenMuxChatImage[] {
  if (!Array.isArray(raw)) return [];
  const images: ZenMuxChatImage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const b64 = (item as { imageBase64?: string }).imageBase64?.trim();
    if (!b64 || b64.length < 32) continue;
    if (b64.length > 12_000_000) continue;
    images.push({
      imageBase64: b64,
      mimeType: (item as { mimeType?: string }).mimeType,
    });
    if (images.length >= CHAT_MAX_IMAGES_PER_MESSAGE) break;
  }
  return images;
}

chatRouter.post('/sessions/:id/messages', async (c) => {
  const sessionId = c.req.param('id');
  const body = await c.req.json<{
    content?: string;
    images?: ZenMuxChatImage[];
    contextSelection?: import('@shiren/shared').ContextSelection;
  }>();
  const text = body.content?.trim() ?? '';
  const images = parseChatImages(body.images);
  if (!text && images.length === 0) return jsonError(c, ErrorCodes.VALIDATION, 400);
  const contextSelection = parseContextSelectionFromBody(body);
  const imageCount = images.length;
  const imageOnlyFallback = '请根据我上传的图片回答';
  const storedContent = chatStoredUserContent({
    text,
    imageCount,
    imageOnlyFallback,
  });
  const pendingForContext = chatPendingUserForContext(text, imageCount);

  if (!listChatSessions().find((s) => s.id === sessionId)) {
    return jsonError(c, ErrorCodes.NOT_FOUND, 404);
  }

  let apiKey: string;
  try {
    apiKey = getDeepSeekKey(c);
  } catch (e) {
    return handleAiError(c, e);
  }

  const dialect = parseReplyDialect(c.req.header(REPLY_DIALECT_HEADER));
  let prepared;
  try {
    prepared = await prepareChatContext({
      apiKey,
      sessionId,
      pendingUser: pendingForContext,
      dialect,
      contextSelection,
    });
  } catch (e) {
    return handleAiError(c, e);
  }

  let reply: string;
  let modelLabel = ZENMUX_MODEL_CHAT;
  try {
    let zenmuxKey: string;
    try {
      zenmuxKey = getZenMuxKey(c);
    } catch (e) {
      return handleZenMuxError(c, e);
    }
    if (imageCount > 0) {
      reply = await zenmuxChatWithImages({
        apiKey: zenmuxKey,
        messages: prepared.messages,
        images,
        imageNotice: chatImageTurnLlmNotice(imageCount),
      });
    } else {
      reply = await zenmuxCompleteMessages({
        apiKey: zenmuxKey,
        messages: prepared.messages,
        model: ZENMUX_MODEL_CHAT,
        maxTokens: 4096,
        temperature: 0.5,
      });
    }
  } catch (e) {
    if (e instanceof ZenMuxError && e.message === 'ZENMUX_KEY_MISSING') {
      return jsonError(c, ErrorCodes.ZENMUX_KEY_MISSING, 400);
    }
    if (e instanceof ZenMuxError) {
      return handleZenMuxError(c, e);
    }
    return handleAiError(c, e);
  }

  log('info', 'chat.reply', {
    sessionId,
    model: modelLabel,
    dialect,
    imageCount,
    contextRatio: prepared.usage.ratio,
    requestId: c.get('requestId'),
  });

  const userMsg = addChatMessage(sessionId, 'user', storedContent)!;
  const assistantMsg = addChatMessage(sessionId, 'assistant', reply)!;

  let sessionTitle = prepared.session;
  try {
    const title = await summarizeChatSessionTitle({
      apiKey,
      messages: getChatMessages(sessionId).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      lastUserMessage: storedContent,
      dialect,
    });
    sessionTitle = updateChatSessionTitle(sessionId, title) ?? sessionTitle;
    log('info', 'chat.session.title', { sessionId, title, requestId: c.get('requestId') });
  } catch (e) {
    log('warn', 'chat.session.title.fail', {
      sessionId,
      error: String(e),
      requestId: c.get('requestId'),
    });
    const fallback = storedContent.replace(/\s+/g, ' ').slice(0, 28);
    if (fallback) {
      sessionTitle = updateChatSessionTitle(sessionId, fallback) ?? sessionTitle;
    }
  }

  return c.json({
    ok: true,
    data: {
      user: userMsg,
      assistant: assistantMsg,
      session: sessionTitle,
      contextUsage: prepared.usage,
    },
    requestId: c.get('requestId'),
  });
});
