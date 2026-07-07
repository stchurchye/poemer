import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatArticleChaptersForLlm } from './writingAssistantContext.js';
import type { Document } from './types.js';

function makeDoc(chapterCount: number, charsPerChapter: number): Document {
  const chapters = [];
  for (let i = 0; i < chapterCount; i++) {
    chapters.push({
      id: `ch${i}`,
      title: `第${i + 1}节标题`,
      order: i,
      blocks: [{ id: `b${i}`, content: '内容'.repeat(charsPerChapter / 2) }],
    });
  }
  return {
    id: 'doc1',
    title: '回忆录',
    chapters,
    createdAt: 0,
    updatedAt: 0,
  } as unknown as Document;
}

// ---- A3：多章长文尾章不整章静默丢弃 ----

test('formatArticleChaptersForLlm: 超长文档每一章标题都出现（无章节静默消失）', () => {
  // 20 章、每章 3000 字，总量远超 MAX_DOCUMENT_EXCERPT=16000
  const doc = makeDoc(20, 3000);
  const active = 'ch0';
  const out = formatArticleChaptersForLlm(doc, active);
  for (let i = 0; i < 20; i++) {
    assert.ok(out.includes(`第${i + 1}节标题`), `第${i + 1}章标题应至少以占位形式出现`);
  }
});

test('formatArticleChaptersForLlm: 当前待改章在靠后位置时仍被完整/优先保留', () => {
  const doc = makeDoc(20, 3000);
  const active = 'ch15'; // 靠后的当前章
  const out = formatArticleChaptersForLlm(doc, active);
  assert.ok(out.includes('第16节标题'), '当前章标题必须出现');
  assert.ok(out.includes('（当前待改章节）'), '当前章应带当前待改标注');
});

test('formatArticleChaptersForLlm: 折叠的章节可通过收集器返回供上层摘要', () => {
  const doc = makeDoc(20, 3000);
  const folded: string[] = [];
  formatArticleChaptersForLlm(doc, 'ch0', folded);
  assert.ok(folded.length > 0, '应收集到被折叠章节文本供上层触发全篇摘要');
});

test('formatArticleChaptersForLlm: 短文档不折叠、行为不变（回归）', () => {
  const doc = makeDoc(3, 200);
  const out = formatArticleChaptersForLlm(doc, 'ch0');
  assert.ok(!out.includes('已折叠'), '短文档不应出现折叠占位');
  assert.ok(out.includes('第1节标题') && out.includes('第3节标题'));
});
