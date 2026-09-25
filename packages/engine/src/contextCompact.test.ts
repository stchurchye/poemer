import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactHistoryViaLlm, compactDocumentExcerptViaLlm } from './contextCompact.js';
import { estimateTokens, getCompactSummaryMaxTokens } from '@shiren/shared';
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

function hasUnpairedSurrogate(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
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

test('compactHistoryViaLlm: 超长历史按压缩模型输入预算分块', async () => {
  const { model, calls } = spyModel('阶段摘要');
  await compactHistoryViaLlm({
    model,
    messages: [{ role: 'user', content: '很长的历史'.repeat(5000) }],
    inputLimitTokens: 2500,
  });

  assert.ok(calls.length > 1, '超长历史不应只发一个越窗请求');
  for (const call of calls) {
    const inputTokens = call.messages.reduce(
      (sum, message) => sum + estimateTokens(message.content),
      0,
    );
    assert.ok(
      inputTokens + (call.maxTokens ?? 0) <= 2500,
      `压缩请求不得超过窗口，实得 ${inputTokens + (call.maxTokens ?? 0)}`,
    );
  }
});

test('compactDocumentExcerptViaLlm: 超长文档也按输入预算分块', async () => {
  const { model, calls } = spyModel('阶段文档摘要');
  await compactDocumentExcerptViaLlm({
    model,
    documentExcerpt: '很长的文稿'.repeat(5000),
    inputLimitTokens: 2500,
  });

  assert.ok(calls.length > 1);
  assert.ok(
    calls.every(
      (call) =>
        call.messages.reduce((sum, message) => sum + estimateTokens(message.content), 0) +
          (call.maxTokens ?? 0) <=
        2500,
    ),
  );
});

test('compactHistoryViaLlm: 后续 chunk 被描述为更新的对话而不是更早的对话', async () => {
  const { model, calls } = spyModel('阶段摘要');
  await compactHistoryViaLlm({
    model,
    messages: [{ role: 'user', content: '按时间向后发展的历史'.repeat(5000) }],
    inputLimitTokens: 2500,
  });

  assert.ok(calls.length > 1);
  for (const call of calls.slice(1)) {
    const prompt = call.messages.at(-1)?.content ?? '';
    assert.match(prompt, /后续|更新/);
    assert.doesNotMatch(prompt, /更早的对话/);
  }
});

test('compactHistoryViaLlm: 分块边界不会拆开 emoji 代理对', async () => {
  const { model, calls } = spyModel('阶段摘要');
  await compactHistoryViaLlm({
    model,
    messages: [{ role: 'user', content: '😀'.repeat(1000) }],
    inputLimitTokens: 520,
  });

  assert.ok(calls.length > 1, '测试前提：emoji 历史应被分块');
  for (const call of calls) {
    assert.ok(
      call.messages.every((message) => !hasUnpairedSurrogate(message.content)),
      '任一压缩请求都不应包含被拆开的代理对',
    );
  }
});

test('compactHistoryViaLlm: 模型输出截断时缩小当前分块重试且不跳过原文', async () => {
  const calls: ModelCompletionInput[] = [];
  const source = `开头标记${'不能丢失的历史信息'.repeat(3000)}尾部标记`;
  const model: ModelClient = {
    async complete(input) {
      calls.push(input);
      if (calls.length === 1) {
        return { text: '只写出了一半的摘要', finishReason: 'length' };
      }
      return { text: '完整阶段摘要' };
    },
  };

  const result = await compactHistoryViaLlm({
    model,
    messages: [{ role: 'user', content: source }],
    inputLimitTokens: 2500,
  });

  assert.equal(result, '完整阶段摘要');
  assert.ok(calls.length > 2, '缩小重试成功后还应继续处理剩余分块');
  const firstPrompt = calls[0].messages.at(-1)?.content ?? '';
  const retryPrompt = calls[1].messages.at(-1)?.content ?? '';
  assert.ok(
    estimateTokens(retryPrompt) < estimateTokens(firstPrompt),
    '截断后的当前分块必须变小',
  );
  assert.ok(
    calls.some((call) => call.messages.some((message) => message.content.includes('尾部标记'))),
    '截断请求不能推进 remaining，后续必须处理到原文尾部',
  );
});

test('compactHistoryViaLlm: 模型持续截断时有限重试后拒绝提交不完整摘要', async () => {
  const calls: ModelCompletionInput[] = [];
  const model: ModelClient = {
    async complete(input) {
      calls.push(input);
      return { text: '只写出了一半的摘要', finishReason: 'length' };
    },
  };

  await assert.rejects(
    compactHistoryViaLlm({
      model,
      messages: [{ role: 'user', content: '不能丢失的历史信息'.repeat(1000) }],
      inputLimitTokens: 2500,
    }),
    /CONTEXT_COMPACT_OUTPUT_TRUNCATED/,
  );
  assert.ok(calls.length > 1, '应尝试缩小当前分块');
  assert.ok(calls.length <= 8, '截断重试必须有严格上限');
});
