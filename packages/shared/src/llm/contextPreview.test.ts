import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blocksFromAssembleChatResult } from './contextPreview.js';
import { assembleChatContext } from './contextBudget.js';

// ---- C-Preview：预览历史块的 messageId 与实际 fitted 消息一一对应 ----

test('blocksFromAssembleChatResult: 有历史被预算裁掉时，历史块 messageId 对齐到 fitted 尾部而非从头', () => {
  const history: { role: 'user' | 'assistant'; content: string }[] = [];
  const ids: string[] = [];
  for (let i = 0; i < 8; i++) {
    history.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: '话题内容'.repeat(150) });
    ids.push(`m${i}`);
  }
  // 小预算：只有尾部若干条 fitted，前面的进 omitted
  const assembled = assembleChatContext({
    systemPrompt: 's',
    history,
    pendingUser: '现在的问题',
    limitTokens: 1500,
    outputReserve: 100,
  });
  const preview = blocksFromAssembleChatResult(assembled, { historyMessageIds: ids });

  const historyBlocks = preview.blocks.filter(
    (b) => (b.kind === 'history_user' || b.kind === 'history_assistant') && !b.omittedByBudget,
  );
  assert.ok(historyBlocks.length > 0 && historyBlocks.length < ids.length, '应有部分历史被裁');

  // fitted 块对应的是原始 id 数组的尾部；第一个 fitted 块的 id 不应是 m0
  const fittedCount = historyBlocks.length;
  const expectedFirstId = ids[ids.length - fittedCount];
  assert.equal(historyBlocks[0].messageId, expectedFirstId, '首个 fitted 块 id 应对齐尾部偏移');
  assert.equal(
    historyBlocks[historyBlocks.length - 1].messageId,
    ids[ids.length - 1],
    '最后一个 fitted 块 id 应为最新消息',
  );
});
