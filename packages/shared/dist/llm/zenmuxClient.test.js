import assert from 'node:assert/strict';
import test from 'node:test';
import { zenmuxCompleteMessages } from './zenmuxClient.js';
test('zenmuxCompleteMessages exposes the provider finish reason', async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = (async () => new Response(JSON.stringify({
        choices: [
            {
                message: { content: '只生成了一部分' },
                finish_reason: 'length',
            },
        ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    let finishReason;
    const text = await zenmuxCompleteMessages({
        apiKey: 'test-key',
        messages: [{ role: 'user', content: '请压缩上下文' }],
        onMeta: (meta) => {
            finishReason = meta.finishReason;
        },
    });
    assert.equal(text, '只生成了一部分');
    assert.equal(finishReason, 'length');
});
//# sourceMappingURL=zenmuxClient.test.js.map