import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareChatContext,
  commitPreparedChatContext,
  commitPreparedWritingContext,
  prepareWritingIntentContext,
  prepareWritingExecuteContext,
} from './contextPipeline.js';
import type { ContextStoreAdapter } from './contextStore.js';
import type { ModelClient } from './modelClient.js';
import type {
  ChatMessage,
  ChatSession,
  Document,
  WritingAssistantMessage,
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
    chapters: [{ id: 'c1', title: '第一章', order: 0, blocks: [{ id: 'b1', content: '正文' }] }],
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

// ---- C2：改稿执行把用户指令放进 pinned 段，正文超长也不丢 ----

test('prepareWritingExecuteContext: 正文超长时用户补充指令仍完整送达', () => {
  const instruction = '把这段改得更口语、更亲切，这句要求不能丢';
  const { messages } = prepareWritingExecuteContext({
    action: '润色',
    oldText: '正文'.repeat(30000),
    instruction,
    chapterTitle: '第一章',
    limitTokens: 4000,
    outputReserve: 200,
  } as Parameters<typeof prepareWritingExecuteContext>[0]);
  const userMsg = messages.find((m) => m.role === 'user');
  assert.ok(userMsg && userMsg.content.includes(instruction), '用户指令必须完整送达');
});
