import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMarkdownImport } from './importMarkdown.js';
test('# 一级标题作文档名并从正文剥除;无 ## 时单章', () => {
    const plan = planMarkdownImport('notes.md', '# 我的笔记\n\n正文第一段。\n第二段。');
    assert.equal(plan.title, '我的笔记');
    assert.equal(plan.chapters.length, 1);
    assert.equal(plan.chapters[0].title, '');
    assert.equal(plan.chapters[0].content, '正文第一段。\n第二段。');
});
test('无一级标题 → 文件名去扩展名作文档名', () => {
    const plan = planMarkdownImport('读书笔记.markdown', '就一段话。');
    assert.equal(plan.title, '读书笔记');
    assert.equal(plan.chapters[0].content, '就一段话。');
});
test('## 二级标题切章;前言归「开篇」', () => {
    const raw = '# 书\n\n引言两句。\n\n## 第一部分\n甲内容\n\n## 第二部分\n乙内容';
    const plan = planMarkdownImport('book.md', raw);
    assert.equal(plan.title, '书');
    assert.deepEqual(plan.chapters.map((c) => c.title), ['开篇', '第一部分', '第二部分']);
    assert.equal(plan.chapters[0].content, '引言两句。');
    assert.equal(plan.chapters[1].content, '甲内容');
    assert.equal(plan.chapters[2].content, '乙内容');
});
test('无前言时不产生空「开篇」章', () => {
    const plan = planMarkdownImport('a.md', '## 甲\n1\n## 乙\n2');
    assert.deepEqual(plan.chapters.map((c) => c.title), ['甲', '乙']);
});
test('BOM/CRLF 归一;空文件也保底一章', () => {
    const plan = planMarkdownImport('x.txt', '﻿你好\r\n世界');
    assert.equal(plan.chapters[0].content, '你好\n世界');
    const empty = planMarkdownImport('y.md', '   ');
    assert.equal(empty.chapters.length, 1);
    assert.equal(empty.chapters[0].content, '');
    assert.equal(empty.title, 'y');
});
test('章节数超上限(50)→ 溢出合并进末章,标题行保留为正文', () => {
    const secs = Array.from({ length: 60 }, (_, i) => `## 第${i}节\n内容${i}`).join('\n');
    const plan = planMarkdownImport('big.md', secs);
    assert.equal(plan.chapters.length, 50);
    const last = plan.chapters[49];
    assert.ok(last.content.includes('## 第55节'));
    assert.ok(last.content.includes('内容59'));
});
//# sourceMappingURL=importMarkdown.test.js.map