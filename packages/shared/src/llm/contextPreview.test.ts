import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blocksFromAssembleChatResult,
  blocksFromWritingIntent,
} from './contextPreview.js';
import {
  assembleChatContext,
  assembleWritingIntentContext,
} from './contextBudget.js';

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

test('blocksFromAssembleChatResult: 被排除的既有摘要仍显示为未选块且不进入实际 messages', () => {
  const assembled = assembleChatContext({
    systemPrompt: 'system',
    history: [{ role: 'user', content: '新消息' }],
    pendingUser: '继续',
    limitTokens: 10_000,
  });
  const preview = blocksFromAssembleChatResult(assembled, {
    availableSummary: '既有摘要',
  });
  const summary = preview.blocks.find((block) => block.kind === 'summary');

  assert.ok(summary, '摘要块应保留在编辑器中');
  assert.equal(summary!.id, 'summary-1', '沿用稳定 id，避免选择状态漂移');
  assert.equal(summary!.selectedByDefault, false);
  assert.ok(preview.messages.every((message) => !message.content.includes('既有摘要')));
});

test('preview block ids stay stable when summary visibility changes', () => {
  const history = [
    { role: 'user' as const, content: '问题' },
    { role: 'assistant' as const, content: '回答' },
  ];
  const ids = ['m-user', 'm-assistant'];
  const withoutSummary = blocksFromAssembleChatResult(
    assembleChatContext({
      systemPrompt: 'system',
      history,
      pendingUser: '继续',
      limitTokens: 10_000,
    }),
    { historyMessageIds: ids },
  );
  const withSummary = blocksFromAssembleChatResult(
    assembleChatContext({
      systemPrompt: 'system',
      summary: '摘要',
      history,
      pendingUser: '继续',
      limitTokens: 10_000,
    }),
    { historyMessageIds: ids },
  );

  const chatIds = (preview: typeof withoutSummary) =>
    preview.blocks
      .filter((block) => block.messageId)
      .map((block) => [block.messageId, block.id]);
  assert.deepEqual(chatIds(withoutSummary), chatIds(withSummary));

  const writingWithoutSummary = blocksFromWritingIntent(
    assembleWritingIntentContext({
      systemPrompt: 'system',
      history,
      chapterBlock: '章节',
      documentBlock: '全文',
      userMessage: '继续',
      limitTokens: 10_000,
    }),
    { chapterBlock: '章节', documentBlock: '全文', historyMessageIds: ids },
  );
  const writingWithSummary = blocksFromWritingIntent(
    assembleWritingIntentContext({
      systemPrompt: 'system',
      summary: '摘要',
      history,
      chapterBlock: '章节',
      documentBlock: '全文',
      userMessage: '继续',
      limitTokens: 10_000,
    }),
    { chapterBlock: '章节', documentBlock: '全文', historyMessageIds: ids },
  );
  const stableKinds = new Set(['document_chapter', 'document_excerpt']);
  const writingIds = (preview: typeof writingWithoutSummary) =>
    preview.blocks
      .filter((block) => block.messageId || stableKinds.has(block.kind))
      .map((block) => [block.messageId ?? block.kind, block.id]);
  assert.deepEqual(writingIds(writingWithoutSummary), writingIds(writingWithSummary));
});
