import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTokens,
  getContextWindowTokens,
  getCompactCompletionMaxTokens,
  getCompactSummaryMaxTokens,
  trimTextToTokenBudget,
  assembleChatContext,
  assembleWritingExecuteContext,
  assembleWritingIntentContext,
  COMPACT_SUMMARY_MAX_TOKENS,
} from './contextBudget.js';

// ---- B4 / R-TokenCounter：语言感知的中文估算 ----

test('estimateTokens: 中文比旧的 chars/1.6 更保守（估得更高，防静默溢出）', () => {
  const zh = '这是一段纯中文的回忆录内容用来测试中文分词的估算是否偏保守';
  const old = Math.ceil(zh.length / 1.6);
  assert.ok(estimateTokens(zh) > old, `期望中文估算 > ${old}, 实得 ${estimateTokens(zh)}`);
});

test('estimateTokens: 英文按约 4 字符/token（不过度高估）', () => {
  const en = 'the quick brown fox jumps over the lazy dog and runs away quickly';
  const t = estimateTokens(en);
  assert.ok(t <= Math.ceil(en.length / 3), `英文不应高估: ${t} for len ${en.length}`);
  assert.ok(t >= Math.ceil(en.length / 5));
});

test('estimateTokens: 空串为 0', () => {
  assert.equal(estimateTokens(''), 0);
});

test('estimateTokens: 中文标点（。、《》「」【】—…“”）不被当英文低估', () => {
  const punct = '。、《》「」『』【】—…“”‘’'.repeat(5);
  // 同长度纯英文按 0.25/字，中文标点应显著高于它（按 CJK 0.75 计）
  const en = 'a'.repeat(punct.length);
  assert.ok(estimateTokens(punct) > estimateTokens(en), '中文标点不应被当英文低估');
});

// ---- B4 / R-ModelProfile：窗口按模型 ----

test('getContextWindowTokens 按模型返回真实窗口，非全局 300k', () => {
  assert.equal(getContextWindowTokens('openai/gpt-5.4'), 272_000);
  assert.equal(getContextWindowTokens('google/gemini-3.1-flash-lite'), 1_048_576);
  // 未知模型保守回退，不再是乐观的 300k
  assert.ok(getContextWindowTokens('x/y') <= 272_000);
});

// ---- B1：压缩 completion 上限与摘要裁剪上限解耦 ----

test('getCompactCompletionMaxTokens 远小于 COMPACT_SUMMARY_MAX_TOKENS 且受模型输出上限约束', () => {
  const completion = getCompactCompletionMaxTokens('google/gemini-3.1-flash-lite');
  assert.ok(completion <= 65_536, 'completion 不得超过模型单次输出上限');
  assert.ok(completion !== getCompactSummaryMaxTokens(), 'completion 上限≠摘要裁剪上限（两个独立量）');
  // 未知模型被兜底 profile 的 8192 卡住
  assert.ok(getCompactCompletionMaxTokens('x/y') <= 8_192);
  // 用户要求「上限高一点」：默认不应低到 4096 以下
  assert.ok(getCompactCompletionMaxTokens('google/gemini-3.1-flash-lite') >= 8_192);
});

test('COMPACT_SUMMARY_MAX_TOKENS 已收敛为有界值（不再 100k）', () => {
  assert.ok(COMPACT_SUMMARY_MAX_TOKENS < 100_000);
});

// ---- trim 与语言感知计量一致：裁剪后确实在预算内 ----

test('trimTextToTokenBudget: 裁剪后 estimateTokens <= 预算（中文也成立）', () => {
  const zh = '记忆'.repeat(5000); // 一万汉字
  const budget = 500;
  const out = trimTextToTokenBudget(zh, budget);
  assert.ok(estimateTokens(out) <= budget, `裁剪后仍超预算: ${estimateTokens(out)} > ${budget}`);
  assert.ok(out.length < zh.length);
});

// ---- C-Dedup：历史装入不以 assistant 开头（成对） ----

test('assembleChatContext: 预算只够部分历史时，逐字历史不以 assistant 开头', () => {
  const history: { role: 'user' | 'assistant'; content: string }[] = [];
  for (let i = 0; i < 20; i++) {
    history.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: '内容'.repeat(200) });
  }
  const r = assembleChatContext({
    systemPrompt: 's',
    history,
    pendingUser: '在吗',
    limitTokens: 2000,
    outputReserve: 100,
  });
  const firstHist = r.messages.find((m, i) => i > 0 && m.role !== 'system' && !m.content.startsWith('【此前对话摘要】') && m !== r.messages[r.messages.length - 1]);
  if (firstHist) {
    assert.equal(firstHist.role, 'user', '逐字历史应以 user 开头，不能留孤立 assistant');
  }
});

test('assembleChatContext: 整段历史装得下且以 assistant 开头时，不误触发压缩', () => {
  const history: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'assistant', content: '您好呀' },
    { role: 'user', content: '今天天气' },
    { role: 'assistant', content: '挺好的' },
  ];
  const r = assembleChatContext({
    systemPrompt: 's',
    history,
    pendingUser: '嗯',
    limitTokens: 100_000,
    outputReserve: 1000,
  });
  assert.equal(r.needsCompact, false, '装得下就不该压缩');
  assert.equal(r.messagesToCompact.length, 0, '不应把开头 assistant 误算进待压缩');
  assert.equal(r.usage.droppedVerbatimTurns, 0);
});

// ---- C-Dedup：写作意图 pendingUser 不被双扣 ----

test('assembleWritingIntentContext: pendingUser 只计一次（历史溢出分支不双扣）', () => {
  const history: { role: 'user' | 'assistant'; content: string }[] = [];
  for (let i = 0; i < 30; i++) {
    history.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: '写作'.repeat(300) });
  }
  const r = assembleWritingIntentContext({
    systemPrompt: 's',
    history,
    chapterBlock: '本章',
    documentBlock: '全篇'.repeat(2000),
    userMessage: '帮我改改',
    limitTokens: 5000,
    outputReserve: 100,
  });
  const expectedPending = estimateTokens('用户说：帮我改改');
  assert.equal(r.usage.breakdown.pendingUser, expectedPending, 'pendingUser 应等于单份估算，未被双减');
});

// ---- C2：改稿执行时用户指令不可被截掉 ----

test('assembleWritingExecuteContext: 正文超长时 pinned 指令 100% 保留', () => {
  const longBody = '正文'.repeat(20000);
  const instruction = '请把结尾改得更温柔一些，这句一定不能被砍掉';
  const r = assembleWritingExecuteContext({
    systemPrompt: 's',
    trimmableParts: [`待改本章正文：\n${longBody}`],
    pinnedParts: [`用户补充：${instruction}`],
    limitTokens: 3000,
    outputReserve: 200,
  });
  assert.ok(r.userContent.includes(instruction), '用户指令必须完整送达');
  assert.ok(estimateTokens(r.userContent) <= 3000);
});
