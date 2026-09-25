import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareChatContext,
  compactChatSession,
  commitPreparedChatContext,
  commitPreparedWritingContext,
  prepareWritingIntentContext,
  prepareWritingExecuteContext,
  previewChatContextPreview,
  previewWritingIntentContextPreview,
} from './contextPipeline.js';
import type { ContextStoreAdapter } from './contextStore.js';
import type { ModelClient } from './modelClient.js';
import type {
  ChatMessage,
  ChatSession,
  Document,
  WritingAssistantMessage,
} from '@shiren/shared';
import {
  exclusionFromBlocks,
  ZENMUX_MODEL_CHAT,
  ZENMUX_MODEL_FLASH_LITE,
} from '@shiren/shared';

function makeStore(session: ChatSession, messages: ChatMessage[]) {
  let stored = { ...session };
  const updateCalls: Array<{ summary: string; upToId: string | null }> = [];
  const store: ContextStoreAdapter = {
    getChatSession: () => stored,
    getChatMessages: () => messages,
    updateChatSessionContext: (_id, summary, upToId) => {
      updateCalls.push({ summary, upToId });
      stored = { ...stored, contextSummary: summary, contextSummaryUpToMessageId: upToId };
      return stored;
    },
    getDocument: () => undefined,
    getWritingAssistantMessages: () => [],
    updateDocumentContextFields: () => undefined,
  };
  return { store, updateCalls, current: () => stored };
}

function bigMsgs(n: number): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `m${i}`,
      sessionId: 's1',
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: '很长的对话内容'.repeat(400),
      createdAt: String(i),
    });
  }
  return out;
}

const compactModel: ModelClient = {
  async complete() {
    return { text: '【摘要】早前聊了很多' };
  },
};

const session: ChatSession = {
  id: 's1',
  title: '会话',
  createdAt: '0',
  updatedAt: '0',
  contextSummary: null,
  contextSummaryUpToMessageId: null,
};

// ---- A1 / R-PlanCommit：prepare 阶段不落库，压缩产物随返回值待提交 ----

test('prepareChatContext: 触发压缩时不写 store，改为返回 pendingContextCommit', async () => {
  const { store, updateCalls } = makeStore(session, bigMsgs(40));
  const prepared = await prepareChatContext({
    store,
    model: compactModel,
    sessionId: 's1',
    pendingUser: '在吗',
    limitTokens: 3000,
  });
  assert.equal(updateCalls.length, 0, 'prepare 阶段绝不能写 store');
  assert.ok(prepared.pendingContextCommit, '应返回待提交的压缩产物');
  assert.ok(prepared.pendingContextCommit!.summary.length > 0);
});

test('prepareChatContext: 压缩调用按独立压缩模型 profile 设置输出预算', async () => {
  const calls: Array<number | undefined> = [];
  const model: ModelClient = {
    async complete(input) {
      calls.push(input.maxTokens);
      return { text: '【摘要】早前聊了很多' };
    },
  };
  const { store } = makeStore(session, bigMsgs(40));

  await prepareChatContext({
    store,
    model,
    sessionId: 's1',
    pendingUser: '在吗',
    limitTokens: 3000,
    modelId: ZENMUX_MODEL_CHAT,
    compactModelId: ZENMUX_MODEL_FLASH_LITE,
  });

  assert.ok(calls.length > 0, '测试前提：应触发压缩');
  assert.ok(calls.every((maxTokens) => maxTokens === 16_384));
});

test('commitPreparedChatContext: 回复成功后提交才写一次 store', async () => {
  const { store, updateCalls, current } = makeStore(session, bigMsgs(40));
  const prepared = await prepareChatContext({
    store,
    model: compactModel,
    sessionId: 's1',
    pendingUser: '在吗',
    limitTokens: 3000,
  });
  commitPreparedChatContext(store, 's1', prepared);
  assert.equal(updateCalls.length, 1, '提交时只写一次');
  assert.ok(current().contextSummary, '摘要已落库');
  assert.ok(current().contextSummaryUpToMessageId, '锚点已推进');
});

test('prepareChatContext: 压缩返回空串时不推进锚点、不提交（不丢历史）', async () => {
  const { store, updateCalls } = makeStore(session, bigMsgs(40));
  const emptyModel: ModelClient = {
    async complete() {
      return { text: '   ' }; // 弱模型拒答/上游返回空
    },
  };
  const prepared = await prepareChatContext({
    store,
    model: emptyModel,
    sessionId: 's1',
    pendingUser: '在吗',
    limitTokens: 3000,
  });
  assert.equal(prepared.pendingContextCommit, undefined, '空摘要不应提交');
  commitPreparedChatContext(store, 's1', prepared);
  assert.equal(updateCalls.length, 0, '空摘要绝不能推进锚点/写 store');
});

test('prepareChatContext: 不触发压缩时无 pendingContextCommit', async () => {
  const { store } = makeStore(session, bigMsgs(2));
  const prepared = await prepareChatContext({
    store,
    model: compactModel,
    sessionId: 's1',
    pendingUser: '你好',
    limitTokens: 300_000,
  });
  assert.equal(prepared.pendingContextCommit, undefined);
});

test('prepareChatContext: 用户排除既有摘要时，本轮不发送摘要且不改写持久锚点', async () => {
  const withSummary: ChatSession = {
    ...session,
    contextSummary: '不应发送的既有摘要',
    contextSummaryUpToMessageId: 'm1',
  };
  const { store, updateCalls } = makeStore(withSummary, bigMsgs(4));

  const prepared = await prepareChatContext({
    store,
    model: compactModel,
    sessionId: 's1',
    pendingUser: '只看新消息',
    contextSelection: { excludedBlockIds: ['summary-1'] },
    limitTokens: 300_000,
  });

  assert.ok(prepared.messages.every((message) => !message.content.includes('不应发送的既有摘要')));
  assert.equal(prepared.pendingContextCommit, undefined);
  commitPreparedChatContext(store, 's1', prepared);
  assert.equal(updateCalls.length, 0);
});

test('compactChatSession: 压缩返回空串时不推进锚点', async () => {
  const { store, updateCalls, current } = makeStore(session, bigMsgs(4));
  const emptyModel: ModelClient = {
    async complete() {
      return { text: '   ' };
    },
  };

  const result = await compactChatSession({
    store,
    model: emptyModel,
    sessionId: 's1',
  });

  assert.equal(updateCalls.length, 0, '空摘要不能写入 store');
  assert.equal(current().contextSummaryUpToMessageId, null, '锚点必须保持不变');
  assert.match(result.confirmation, /保留/);
});

test('prepareChatContext: 排除的消息不送入压缩模型，也不持久推进锚点', async () => {
  const messages = bigMsgs(12);
  messages[1] = { ...messages[1], content: '绝不能送进模型的私密内容' };
  const seen: string[] = [];
  const recordingModel: ModelClient = {
    async complete(input) {
      seen.push(input.messages.map((message) => message.content).join('\n'));
      return { text: '【摘要】其余历史' };
    },
  };
  const { store, updateCalls } = makeStore(session, messages);

  const prepared = await prepareChatContext({
    store,
    model: recordingModel,
    sessionId: 's1',
    pendingUser: '继续',
    contextSelection: { excludedMessageIds: ['m1'] },
    limitTokens: 3000,
  });

  assert.ok(seen.length > 0, '测试前提：应触发压缩');
  assert.ok(seen.every((input) => !input.includes('绝不能送进模型的私密内容')));
  assert.equal(prepared.pendingContextCommit, undefined, '筛选后的临时摘要不能持久化');
  commitPreparedChatContext(store, 's1', prepared);
  assert.equal(updateCalls.length, 0, '不能用单一锚点跨过被排除消息');
});

test('previewChatContextPreview: 排除消息刷新后仍可见且往返选择不丢失', async () => {
  const messages = bigMsgs(2);
  messages[0] = { ...messages[0], content: '本轮明确排除' };
  const { store } = makeStore(session, messages);
  const preview = await previewChatContextPreview({
    store,
    sessionId: session.id,
    pendingUser: '继续',
    contextSelection: { excludedMessageIds: ['m0'], excludedBlockIds: [] },
  });

  const excluded = preview.blocks.find((block) => block.messageId === 'm0');
  assert.ok(excluded);
  assert.equal(excluded.selectedByDefault, false);
  assert.ok(preview.messages.every((message) => !message.content.includes('本轮明确排除')));

  const selectedIds = preview.blocks
    .filter((block) => !block.selectable || block.selectedByDefault)
    .map((block) => block.id);
  assert.deepEqual(exclusionFromBlocks(preview.blocks, selectedIds).excludedMessageIds, ['m0']);
});

// ---- B2：ratio 达阈值但历史仍装得下时，也预防式压缩最老轮 ----

test('prepareChatContext: 高占用但未溢出时仍预防式压缩（不再一进循环就 break）', async () => {
  // 造一个刚好装得下、但占用超过阈值的历史
  const msgs = bigMsgs(20);
  const { store } = makeStore(session, msgs);
  // limit 调到刚好容纳但 ratio 高
  const prepared = await prepareChatContext({
    store,
    model: compactModel,
    sessionId: 's1',
    pendingUser: '继续',
    limitTokens: 12000,
    outputReserve: 200,
  });
  // 只要压缩发生（有摘要产物）即说明预防式压缩生效
  assert.ok(prepared.pendingContextCommit, '高占用应触发预防式压缩');
});

// ---- review#1：写作侧压缩也延迟提交，prepare 阶段不落库 ----

test('prepareWritingIntentContext: 触发压缩时不写 store，commit 后才写一次', async () => {
  const doc: Document = {
    id: 'd1',
    title: '回忆录',
    chapters: [
      {
        id: 'c1',
        title: '第一章',
        order: 0,
        chapterSummary: '',
        blocks: [{ id: 'b1', content: '正文', currentRevisionId: null }],
      },
    ],
    globalSummary: '',
    styleGuide: '',
    currentRevisionId: null,
    revisionCount: 0,
    updatedAt: '0',
    createdAt: '0',
    writingContextSummary: null,
    writingContextSummaryUpToMessageId: null,
  } as Document;

  const msgs: WritingAssistantMessage[] = [];
  for (let i = 0; i < 30; i++) {
    msgs.push({
      id: `w${i}`,
      documentId: 'd1',
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: '写作侧栏很长的对话'.repeat(300),
      kind: 'chat',
      createdAt: String(i),
    });
  }

  const updates: unknown[] = [];
  const store: ContextStoreAdapter = {
    getChatSession: () => undefined,
    getChatMessages: () => [],
    updateChatSessionContext: () => undefined,
    getDocument: () => doc,
    getWritingAssistantMessages: () => msgs,
    updateDocumentContextFields: (_id, fields) => {
      updates.push(fields);
      return doc;
    },
  };

  const prepared = await prepareWritingIntentContext({
    store,
    model: compactModel,
    documentId: 'd1',
    document: doc,
    allMessages: msgs,
    chapterBlock: '当前章',
    documentBlock: '全篇',
    userMessage: '帮我看看',
    limitTokens: 4000,
  } as Parameters<typeof prepareWritingIntentContext>[0]);

  assert.equal(updates.length, 0, 'prepare 阶段绝不能写 store');
  assert.ok(prepared.pendingWritingContextCommit, '应返回写作侧待提交产物');

  commitPreparedWritingContext(store, 'd1', prepared);
  assert.equal(updates.length, 1, '提交时才写一次');
});

test('prepareWritingIntentContext: 排除消息时只做本轮压缩，不持久推进锚点', async () => {
  const doc: Document = {
    id: 'd2',
    title: '回忆录',
    chapters: [
      {
        id: 'c1',
        title: '第一章',
        order: 0,
        blocks: [{ id: 'b1', content: '正文', currentRevisionId: null }],
      },
    ],
    globalSummary: '',
    styleGuide: '',
    currentRevisionId: null,
    revisionCount: 0,
    updatedAt: '0',
    createdAt: '0',
    writingContextSummary: null,
    writingContextSummaryUpToMessageId: null,
  } as Document;
  const messages: WritingAssistantMessage[] = bigMsgs(12).map((message, index) => ({
    id: `w${index}`,
    documentId: 'd2',
    role: message.role,
    content: index === 1 ? '写作侧私密内容' : message.content,
    kind: 'chat',
    createdAt: String(index),
  }));
  const seen: string[] = [];
  const updates: unknown[] = [];
  const store: ContextStoreAdapter = {
    getChatSession: () => undefined,
    getChatMessages: () => [],
    updateChatSessionContext: () => undefined,
    getDocument: () => doc,
    getWritingAssistantMessages: () => messages,
    updateDocumentContextFields: (_id, fields) => {
      updates.push(fields);
      return { ...doc, ...fields };
    },
  };
  const model: ModelClient = {
    async complete(input) {
      seen.push(input.messages.map((message) => message.content).join('\n'));
      return { text: '【摘要】其余写作对话' };
    },
  };

  const prepared = await prepareWritingIntentContext({
    store,
    model,
    documentId: 'd2',
    document: doc,
    allMessages: messages,
    chapterBlock: '当前章',
    documentBlock: '',
    userMessage: '继续',
    contextSelection: { excludedMessageIds: ['w1'] },
    limitTokens: 3000,
  });

  assert.ok(seen.length > 0, '测试前提：应触发压缩');
  assert.ok(seen.every((input) => !input.includes('写作侧私密内容')));
  assert.equal(prepared.pendingWritingContextCommit, undefined);
  commitPreparedWritingContext(store, 'd2', prepared);
  assert.equal(updates.length, 0);
});

test('previewWritingIntentContextPreview: 排除的历史和文档块可见但不进入实际消息', async () => {
  const doc: Document = {
    id: 'preview-doc',
    title: '预览文档',
    chapters: [
      {
        id: 'c1',
        title: '第一章',
        order: 0,
        chapterSummary: '',
        blocks: [{ id: 'b1', content: '正文', currentRevisionId: null }],
      },
    ],
    globalSummary: '',
    styleGuide: '',
    currentRevisionId: null,
    revisionCount: 0,
    createdAt: '0',
    updatedAt: '0',
    hiddenAt: null,
  };
  const messages: WritingAssistantMessage[] = [
    {
      id: 'w-private',
      documentId: doc.id,
      role: 'user',
      content: '排除的写作历史',
      kind: 'chat',
      createdAt: '0',
    },
  ];
  const preview = await previewWritingIntentContextPreview({
    document: doc,
    allMessages: messages,
    chapterBlock: '排除的当前章节',
    documentBlock: '排除的全文节选',
    pendingUser: '继续',
    contextSelection: {
      excludedMessageIds: ['w-private'],
      excludedBlockIds: ['chapter', 'document'],
    },
  });
  const sent = preview.messages.map((message) => message.content).join('\n');

  assert.ok(preview.blocks.some((block) => block.messageId === 'w-private'));
  assert.equal(preview.blocks.find((block) => block.id === 'chapter')?.selectedByDefault, false);
  assert.equal(preview.blocks.find((block) => block.id === 'document')?.selectedByDefault, false);
  assert.ok(!sent.includes('排除的写作历史'));
  assert.ok(!sent.includes('排除的当前章节'));
  assert.ok(!sent.includes('排除的全文节选'));
});

test('prepareWritingIntentContext: 全篇摘要有效时立即缓存，避免双 prepare 重算后丢失', async () => {
  const doc: Document = {
    id: 'd3',
    title: '长篇',
    chapters: [{ id: 'c1', title: '第一章', order: 0, blocks: [{ id: 'b1', content: '正文' }] }],
    globalSummary: '',
    styleGuide: '',
    currentRevisionId: null,
    revisionCount: 0,
    updatedAt: '0',
    createdAt: '0',
    documentContextSummary: null,
  } as Document;
  const updates: Array<Record<string, unknown>> = [];
  const store: ContextStoreAdapter = {
    getChatSession: () => undefined,
    getChatMessages: () => [],
    updateChatSessionContext: () => undefined,
    getDocument: () => doc,
    getWritingAssistantMessages: () => [],
    updateDocumentContextFields: (_id, fields) => {
      updates.push(fields);
      return { ...doc, ...fields };
    },
  };
  const model: ModelClient = {
    async complete() {
      return { text: '有效的全篇摘要' };
    },
  };

  const prepared = await prepareWritingIntentContext({
    store,
    model,
    documentId: 'd3',
    document: doc,
    allMessages: [],
    chapterBlock: '当前章',
    documentBlock: '长篇正文'.repeat(3000),
    userMessage: '继续',
    limitTokens: 4000,
  });

  assert.ok(updates.some((fields) => fields.documentContextSummary === '有效的全篇摘要'));
  assert.equal(
    prepared.pendingWritingContextCommit?.documentContextSummary,
    undefined,
    '无锚点的文档缓存不应依赖后续聊天提交',
  );
});

test('prepareWritingIntentContext: 全篇摘要为空时不缓存', async () => {
  const doc: Document = {
    id: 'd4',
    title: '长篇',
    chapters: [{ id: 'c1', title: '第一章', order: 0, blocks: [{ id: 'b1', content: '正文' }] }],
    globalSummary: '',
    styleGuide: '',
    currentRevisionId: null,
    revisionCount: 0,
    updatedAt: '0',
    createdAt: '0',
    documentContextSummary: null,
  } as Document;
  const updates: unknown[] = [];
  const store: ContextStoreAdapter = {
    getChatSession: () => undefined,
    getChatMessages: () => [],
    updateChatSessionContext: () => undefined,
    getDocument: () => doc,
    getWritingAssistantMessages: () => [],
    updateDocumentContextFields: (_id, fields) => {
      updates.push(fields);
      return doc;
    },
  };
  const emptyModel: ModelClient = { async complete() { return { text: '   ' }; } };

  await prepareWritingIntentContext({
    store,
    model: emptyModel,
    documentId: 'd4',
    document: doc,
    allMessages: [],
    chapterBlock: '当前章',
    documentBlock: '长篇正文'.repeat(3000),
    userMessage: '继续',
    limitTokens: 4000,
  });

  assert.equal(updates.length, 0);
});

// ---- C2：改稿执行把用户指令放进 pinned 段，正文超长也不丢 ----

test('prepareWritingExecuteContext: 整章替换正文超出窗口时明确拒绝而不是静默裁切', () => {
  const instruction = '把这段改得更口语、更亲切，这句要求不能丢';
  assert.throws(
    () =>
      prepareWritingExecuteContext({
        action: '润色',
        oldText: '正文'.repeat(30000),
        instruction,
        chapterTitle: '第一章',
        limitTokens: 4000,
        outputReserve: 200,
      } as Parameters<typeof prepareWritingExecuteContext>[0]),
    /CONTEXT_PINNED_TOO_LARGE/,
  );
});

test('prepareWritingExecuteContext: 超长续写上下文保留正文结尾而不是开头', () => {
  const oldText = `开头标记${'中间内容'.repeat(5000)}结尾标记`;
  const { messages } = prepareWritingExecuteContext({
    action: '续写',
    oldText,
    instruction: '接着写',
    chapterTitle: '第一章',
    limitTokens: 4000,
    outputReserve: 200,
  } as Parameters<typeof prepareWritingExecuteContext>[0]);
  const userMsg = messages.find((m) => m.role === 'user');
  assert.ok(userMsg?.content.includes('结尾标记'));
  assert.ok(!userMsg?.content.includes('开头标记'));
});

test('prepareWritingExecuteContext: 完整改写预计超过输出上限时在调用模型前拒绝', () => {
  assert.throws(
    () =>
      prepareWritingExecuteContext({
        action: '润色',
        oldText: '需要完整保留的正文'.repeat(1000),
        instruction: '只润色措辞',
        limitTokens: 10_000,
        outputReserve: 300,
      }),
    /CONTEXT_REWRITE_OUTPUT_TOO_LARGE/,
  );
});

test('prepareWritingExecuteContext: 缩写允许原文长于输出预留', () => {
  assert.doesNotThrow(() =>
    prepareWritingExecuteContext({
      action: '缩写',
      oldText: '需要缩短的正文'.repeat(1000),
      instruction: '压缩成一段摘要',
      limitTokens: 10_000,
      outputReserve: 300,
    }),
  );
});
