import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractStoryBible } from './storyBibleExtract.js';
import type { ModelClient } from './modelClient.js';
import type { StoryBible } from '@shiren/shared';

function model(reply: string): ModelClient {
  return { async complete() { return { text: reply }; } };
}

test('extractStoryBible: 从正文抽取并与既有设定卡合并', async () => {
  const existing: StoryBible = {
    entries: [{ id: 'x', category: 'character', label: '大姐', note: '旧说明' }],
  };
  const bible = await extractStoryBible({
    model: model('[{"category":"character","label":"大姐","note":"大女儿，1955年生"},{"category":"term","label":"阿珍","note":"大姐小名"}]'),
    documentExcerpt: '大姐（阿珍）是大女儿，1955 年生。',
    existing,
  });
  const daJie = bible.entries.find((e) => e.label === '大姐');
  assert.equal(daJie?.note, '大女儿，1955年生', '同 label 应被新抽取覆盖');
  assert.ok(bible.entries.some((e) => e.label === '阿珍'), '新条目追加');
});

test('extractStoryBible: 模型无有效 JSON 时保留既有设定卡（不清空、不抛错）', async () => {
  const existing: StoryBible = {
    entries: [{ id: 'x', category: 'character', label: '大姐', note: '大女儿' }],
  };
  const bible = await extractStoryBible({
    model: model('抱歉我没有找到可提取的设定'),
    documentExcerpt: '一些正文',
    existing,
  });
  assert.deepEqual(bible, existing);
});

test('extractStoryBible: 模型调用抛错时不影响主流程，返回既有', async () => {
  const throwing: ModelClient = { async complete() { throw new Error('网络错误'); } };
  const existing: StoryBible = { entries: [] };
  const bible = await extractStoryBible({ model: throwing, documentExcerpt: '正文', existing });
  assert.deepEqual(bible, existing);
});

test('extractStoryBible: 空正文直接返回既有，不调用模型', async () => {
  let called = false;
  const spy: ModelClient = { async complete() { called = true; return { text: '[]' }; } };
  const existing: StoryBible = { entries: [{ id: 'x', category: 'style', label: '语气', note: '温和' }] };
  const bible = await extractStoryBible({ model: spy, documentExcerpt: '   ', existing });
  assert.equal(called, false);
  assert.deepEqual(bible, existing);
});
