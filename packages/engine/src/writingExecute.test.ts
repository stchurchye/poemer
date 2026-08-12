import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWritingExecuteRetry } from './writingExecute.js';
import { estimateTokens, getContextWindowTokens } from '@shiren/shared';
import type { ModelClient, ModelCompletionInput } from './modelClient.js';

function spyModel(): { model: ModelClient; calls: ModelCompletionInput[] } {
  const calls: ModelCompletionInput[] = [];
  const model: ModelClient = {
    async complete(input) {
      calls.push(input);
      return { text: '改好的正文\n{"evaluation":"不错","rationale":"更顺口了"}' };
    },
  };
  return { model, calls };
}

// ---- C1：改稿重试也走预算截断，长文多轮不再顶爆窗口 ----

test('runWritingExecuteRetry: 超长原文+上一版下，请求 token 受控且不抛错', async () => {
  const { model, calls } = spyModel();
  const feedback = '这一版还是太书面，请再口语一点，这条本轮意见必须保留';
  await runWritingExecuteRetry({
    model,
    action: '润色',
    oldText: '很长的原文'.repeat(20000),
    baseInstruction: '改口语',
    previousSuggestion: '上一版也很长'.repeat(20000),
    additionalFeedback: feedback,
    priorFeedback: Array.from({ length: 50 }, (_, i) => `历次意见${i}`),
    limitTokens: 5000,
    outputReserve: 200,
  } as Parameters<typeof runWritingExecuteRetry>[0]);

  const main = calls[0];
  const total = main.messages.reduce((s, m) => s + estimateTokens(m.content), 0);
  assert.ok(total <= 5000, `重试请求应受预算约束, 实得 ${total}`);
  const userMsg = main.messages.find((m) => m.role === 'user');
  assert.ok(userMsg!.content.includes(feedback), '用户本轮意见必须完整保留');
});

test('runWritingExecuteRetry: 短文不截断（回归）', async () => {
  const { model, calls } = spyModel();
  await runWritingExecuteRetry({
    model,
    action: '润色',
    oldText: '短原文',
    baseInstruction: '改口语',
    previousSuggestion: '上一版',
    additionalFeedback: '再温柔点',
  });
  const userMsg = calls[0].messages.find((m) => m.role === 'user');
  assert.ok(userMsg!.content.includes('短原文'));
  assert.ok(userMsg!.content.includes('上一版'));
  assert.ok(estimateTokens(userMsg!.content) < getContextWindowTokens());
});
