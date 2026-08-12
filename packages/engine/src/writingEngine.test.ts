import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWritingIntentMessagesLocal } from './writingEngine.js';
import type { ModelClient } from './modelClient.js';

test('analyzeWritingIntentMessagesLocal sends the preassembled context unchanged', async () => {
  const messages = [
    { role: 'system' as const, content: '已预算系统提示' },
    { role: 'user' as const, content: '【此前对话摘要】\n只保留筛选后的摘要' },
    { role: 'user' as const, content: '当前要求' },
  ];
  let received: typeof messages | undefined;
  const model: ModelClient = {
    async complete(input) {
      received = input.messages as typeof messages;
      return {
        text: '{"mode":"revise","ready":true,"referenceScope":"chapter","action":"润色","instruction":""}',
      };
    },
  };

  const result = await analyzeWritingIntentMessagesLocal(
    model,
    messages,
    '当前要求',
  );

  assert.deepEqual(received, messages);
  assert.equal(result.mode, 'revise');
  assert.equal(result.referenceScope, 'chapter');
  assert.equal(result.instruction, '当前要求');
});
