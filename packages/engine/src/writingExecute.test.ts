import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  completeWritingExecute,
  runWritingExecute,
  runWritingExecuteRetry,
} from './writingExecute.js';
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

test('runWritingExecuteRetry: 上一版完整内容超出窗口时拒绝生成部分替换稿', async () => {
  const { model } = spyModel();
  const feedback = '这一版还是太书面，请再口语一点，这条本轮意见必须保留';
  await assert.rejects(
    runWritingExecuteRetry({
      model,
      action: '润色',
      oldText: '很长的原文'.repeat(20000),
      baseInstruction: '改口语',
      previousSuggestion: '上一版也很长'.repeat(20000),
      additionalFeedback: feedback,
      priorFeedback: Array.from({ length: 50 }, (_, i) => `历次意见${i}`),
      limitTokens: 5000,
      outputReserve: 200,
    } as Parameters<typeof runWritingExecuteRetry>[0]),
    /CONTEXT_PINNED_TOO_LARGE/,
  );
});

test('runWritingExecuteRetry: 原文很长但上一版可完整容纳时仍受预算约束', async () => {
  const { model, calls } = spyModel();
  const feedback = '这一版还是太书面，请再口语一点，这条本轮意见必须保留';
  await runWritingExecuteRetry({
    model,
    action: '润色',
    oldText: '很长的原文'.repeat(20000),
    baseInstruction: '改口语',
    previousSuggestion: '可完整容纳的上一版',
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

test('completeWritingExecute: 模型因长度截断时拒绝生成部分替换稿', async () => {
  let calls = 0;
  const model: ModelClient = {
    async complete() {
      calls += 1;
      return { text: '只生成了一半的正文', finishReason: 'length' };
    },
  };

  await assert.rejects(
    completeWritingExecute(
      model,
      [{ role: 'user', content: '请润色完整正文' }],
      { action: '润色', oldText: '完整正文', suggestedText: '完整正文' },
    ),
    /模型没能完整写完/,
  );
  assert.equal(calls, 1, '截断结果不能再通过补写依据伪装成完整改稿');
});

test('completeWritingExecute: 补写依据请求仍受上下文窗口约束', async () => {
  const calls: ModelCompletionInput[] = [];
  const model: ModelClient = {
    async complete(input) {
      calls.push(input);
      return calls.length === 1
        ? { text: '改好的正文' }
        : { text: '{"evaluation":"不错","rationale":"更顺口了"}' };
    },
  };

  await completeWritingExecute(
    model,
    [{ role: 'user', content: '主请求' }],
    {
      action: '润色',
      oldText: '很长的原文'.repeat(5000),
      suggestedText: '很长的建议'.repeat(5000),
      instruction: '更口语',
    },
    { inputLimitTokens: 1200 },
  );

  assert.equal(calls.length, 2);
  const fallback = calls[1]!;
  const total = fallback.messages.reduce(
    (sum, message) => sum + estimateTokens(message.content),
    0,
  );
  assert.ok(total + (fallback.maxTokens ?? 0) <= 1200);
});

test('runWritingExecute: 主改稿调用使用已预留的输出 token', async () => {
  const { model, calls } = spyModel();
  await runWritingExecute({
    model,
    action: '润色',
    oldText: '短原文',
    limitTokens: 4000,
    outputReserve: 600,
  });

  assert.equal(calls[0]?.maxTokens, 600);
});

test('runWritingExecuteRetry: 续写重试接在上一版后而不是原文后', async () => {
  const model: ModelClient = {
    async complete() {
      return { text: '新增段落\n{"evaluation":"不错","rationale":"顺着写"}' };
    },
  };
  const result = await runWritingExecuteRetry({
    model,
    action: '续写',
    oldText: '最初原文',
    baseInstruction: '继续写',
    previousSuggestion: '上一版正文',
    additionalFeedback: '再写一段',
  });

  assert.equal(result.text, '上一版正文新增段落');
});

test('runWritingExecuteRetry: 上一版预计超过输出上限时在调用模型前拒绝', async () => {
  const { model, calls } = spyModel();
  await assert.rejects(
    runWritingExecuteRetry({
      model,
      action: '润色',
      oldText: '原文',
      baseInstruction: '继续润色',
      previousSuggestion: '需要完整输出的上一版'.repeat(1000),
      additionalFeedback: '更自然',
      limitTokens: 10_000,
      outputReserve: 300,
    }),
    /CONTEXT_REWRITE_OUTPUT_TOO_LARGE/,
  );
  assert.equal(calls.length, 0);
});
