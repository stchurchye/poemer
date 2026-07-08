import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSpokenInsert } from './spokenInsert.js';

test('空/纯空白识别结果返回 null(不插入)', () => {
  assert.equal(planSpokenInsert({ existing: '原文', text: '  ', selectionStart: 0, selectionEnd: 0, focused: false }), null);
});

test('没聚焦过、光标在开头 → 追加到末尾', () => {
  const r = planSpokenInsert({ existing: '第一句。', text: '第二句。', selectionStart: 0, selectionEnd: 0, focused: false })!;
  assert.equal(r.content, '第一句。\n\n第二句。');
  assert.equal(r.caret, r.content.length);
});

test('空章追加不加多余分隔', () => {
  const r = planSpokenInsert({ existing: '', text: '开头', selectionStart: 0, selectionEnd: 0, focused: false })!;
  assert.equal(r.content, '开头');
  assert.equal(r.caret, 2);
});

test('已以换行结尾时追加不再加空行', () => {
  const r = planSpokenInsert({ existing: '上文\n', text: '下文', selectionStart: 0, selectionEnd: 0, focused: false })!;
  assert.equal(r.content, '上文\n下文');
});

test('聚焦过、光标在中间 → 按光标插入不覆盖', () => {
  // '我住在广州' 光标在 '我住在'(offset 3) 后
  const r = planSpokenInsert({ existing: '我住在广州', text: '老城区的', selectionStart: 3, selectionEnd: 3, focused: true })!;
  assert.equal(r.content, '我住在老城区的广州');
  assert.equal(r.caret, 3 + 4);
});

test('聚焦过、光标在开头 {0,0} 也按光标插到最前(不误判为追加)', () => {
  const r = planSpokenInsert({ existing: '广州', text: '在', selectionStart: 0, selectionEnd: 0, focused: true })!;
  assert.equal(r.content, '在广州');
  assert.equal(r.caret, 1);
});

test('有选区时取选区起点插入', () => {
  const r = planSpokenInsert({ existing: 'abcdef', text: 'X', selectionStart: 4, selectionEnd: 2, focused: true })!;
  assert.equal(r.content, 'abXcdef');
  assert.equal(r.caret, 3);
});

test('光标越界被 clamp 到正文长度', () => {
  const r = planSpokenInsert({ existing: 'abc', text: 'Z', selectionStart: 99, selectionEnd: 99, focused: true })!;
  assert.equal(r.content, 'abcZ');
  assert.equal(r.caret, 4);
});
