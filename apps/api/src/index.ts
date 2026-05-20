import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { randomUUID } from 'crypto';
import { documentsRouter } from './routes/documents.js';
import { chatRouter } from './routes/chat.js';
import { settingsRouter } from './routes/settings.js';
import { ocrRouter } from './routes/ocr.js';
import { asrRouter } from './routes/asr.js';
import { ttsRouter } from './routes/tts.js';
import { SHIREN_API_PORT } from '@shiren/shared';
import { hydrateStore, seedDemo } from './store/db.js';
import { log } from './lib/logger.js';
import type { AppVariables } from './types.js';

const app = new Hono<{ Variables: AppVariables }>();

app.use('*', cors());
app.use('*', async (c, next) => {
  const requestId = c.req.header('X-Request-Id') ?? randomUUID();
  c.set('requestId', requestId);
  const start = Date.now();
  await next();
  log('info', 'request', {
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    ms: Date.now() - start,
  });
});

app.get('/health', (c) =>
  c.json({ ok: true, service: '诗人-api', requestId: c.get('requestId') }),
);

app.route('/api/documents', documentsRouter);
app.route('/api/chat', chatRouter);
app.route('/api/settings', settingsRouter);
app.route('/api/ocr', ocrRouter);
app.route('/api/asr', asrRouter);
app.route('/api/tts', ttsRouter);

hydrateStore();
seedDemo();

const port = Number(process.env.PORT ?? SHIREN_API_PORT);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  log('info', 'api.started', {
    port: info.port,
    url: `http://127.0.0.1:${info.port}`,
  });
});

export default app;
