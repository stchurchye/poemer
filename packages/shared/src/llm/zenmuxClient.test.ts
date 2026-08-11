import assert from 'node:assert/strict';
import test from 'node:test';
import { parseZenMuxSseChunk } from './zenmuxClient.js';

function dataLine(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n`;
}

test('parseZenMuxSseChunk 抽取增量文本', () => {
  const buf =
    dataLine({ choices: [{ delta: { content: '你' } }] }) +
    dataLine({ choices: [{ delta: { content: '好' } }] });
  const r = parseZenMuxSseChunk(buf);
  assert.deepEqual(r.deltas, ['你', '好']);
  assert.equal(r.rest, '');
  assert.equal(r.done, false);
});

test('parseZenMuxSseChunk 跨 chunk 半行保留在 rest', () => {
  const full = dataLine({ choices: [{ delta: { content: '完整' } }] });
  const half = '{ "choices": [{ "delta": { "content": "半' ; // 没有结尾换行
  const r = parseZenMuxSseChunk(full + 'data: ' + half);
  assert.deepEqual(r.deltas, ['完整']);
  assert.equal(r.rest, 'data: ' + half); // 半行原样留给下一次拼接
});

test('parseZenMuxSseChunk 识别 [DONE] 并忽略非 data 行', () => {
  const buf =
    ': comment\n' +
    dataLine({ choices: [{ delta: { content: 'x' } }] }) +
    'data: [DONE]\n';
  const r = parseZenMuxSseChunk(buf);
  assert.deepEqual(r.deltas, ['x']);
  assert.equal(r.done, true);
});

test('parseZenMuxSseChunk 抽取末尾 usage', () => {
  const buf =
    dataLine({ choices: [{ delta: { content: 'hi' } }] }) +
    dataLine({
      choices: [],
      usage: {
        prompt_tokens: 5320,
        completion_tokens: 40,
        total_tokens: 5360,
        prompt_tokens_details: { cached_tokens: 4000 },
      },
    });
  const r = parseZenMuxSseChunk(buf);
  assert.deepEqual(r.deltas, ['hi']);
  assert.equal(r.usage?.promptTokens, 5320);
  assert.equal(r.usage?.completionTokens, 40);
  assert.equal(r.usage?.cacheHitTokens, 4000);
});

test('parseZenMuxSseChunk 忽略空 delta，不把 0 当文本', () => {
  const buf =
    dataLine({ choices: [{ delta: {} }] }) +
    dataLine({ choices: [{ delta: { content: '' } }] }) +
    dataLine({ choices: [{ delta: { content: 'a' } }] });
  const r = parseZenMuxSseChunk(buf);
  assert.deepEqual(r.deltas, ['a']);
});
