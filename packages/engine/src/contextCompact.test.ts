import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactHistoryViaLlm, compactDocumentExcerptViaLlm } from './contextCompact.js';
import { getCompactSummaryMaxTokens } from '@shiren/shared';
import type { ModelClient, ModelCompletionInput } from './modelClient.js';

function spyModel(reply: string): { model: ModelClient; calls: ModelCompletionInput[] } {
  const calls: ModelCompletionInput[] = [];
  const model: ModelClient = {
    async complete(input) {
      calls.push(input);
      return { text: reply };
    },
  };
  return { model, calls };
}

// ---- B1：压缩 completion 的 maxTokens 用真实输出上限，不再透传 100k ----

test('compactHistoryViaLlm: completion maxTokens 远小于摘要裁剪上限', async () => {
  const { model, calls } = spyModel('这是压缩后的摘要');
  await compactHistoryViaLlm({
    model,
    messages: [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '您好呀' },
    ],
  });
  assert.equal(calls.length, 1);
  const maxTokens = calls[0].maxTokens ?? Infinity;
  assert.ok(maxTokens <= 8192, `completion maxTokens 应 <=8192, 实得 ${maxTokens}`);
  assert.notEqual(maxTokens, getCompactSummaryMaxTokens(), 'completion 上限≠摘要裁剪上限');
  assert.ok(maxTokens >= 4096, '用户要求上限高一点：不应低于 4096');
});

test('compactDocumentExcerptViaLlm: completion maxTokens 同样受控', async () => {
  const { model, calls } = spyModel('全篇摘要');
  await compactDocumentExcerptViaLlm({ model, documentExcerpt: '第一章……第二章……' });
  assert.ok((calls[0].maxTokens ?? Infinity) <= 8192);
});

test('compactHistoryViaLlm: 空历史直接返回既有摘要，不调用模型', async () => {
  const { model, calls } = spyModel('x');
  const out = await compactHistoryViaLlm({ model, messages: [], existingSummary: '旧摘要' });
  assert.equal(out, '旧摘要');
  assert.equal(calls.length, 0);
});
