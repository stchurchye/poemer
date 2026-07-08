import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatStoryBibleForLlm,
  mergeStoryBible,
  parseStoryBibleEntries,
  MAX_STORY_BIBLE_ENTRIES,
  STORY_BIBLE_CATEGORY_LABELS,
} from './storyBible.js';
import type { StoryBible } from './types.js';

test('formatStoryBibleForLlm: 空/无条目返回空串', () => {
  assert.equal(formatStoryBibleForLlm(null), '');
  assert.equal(formatStoryBibleForLlm(undefined), '');
  assert.equal(formatStoryBibleForLlm({ entries: [] }), '');
});

test('formatStoryBibleForLlm: 含条目时输出常驻块，带「以正文为准」的告示与分类标签', () => {
  const bible: StoryBible = {
    entries: [
      { id: 'c1', category: 'character', label: '大姐', note: '大女儿，1955 年生，正文里称「大姐」' },
      { id: 't1', category: 'timeline', label: '搬家', note: '1972 年搬到广州' },
    ],
  };
  const out = formatStoryBibleForLlm(bible);
  assert.ok(out.includes('设定卡'));
  assert.ok(out.includes('以正文为准'), '必须声明冲突时以正文为准，避免抽错的设定强行改稿');
  assert.ok(out.includes('大姐') && out.includes('大女儿'));
  assert.ok(out.includes(STORY_BIBLE_CATEGORY_LABELS.character));
  assert.ok(out.includes(STORY_BIBLE_CATEGORY_LABELS.timeline));
});

test('mergeStoryBible: 同 label 更新 note、新 label 追加、稳定去重', () => {
  const existing: StoryBible = {
    entries: [{ id: 'x', category: 'character', label: '大姐', note: '旧说明' }],
  };
  const merged = mergeStoryBible(existing, {
    entries: [
      { id: 'y', category: 'character', label: '大姐', note: '新说明：1955 年生' },
      { id: 'z', category: 'term', label: '阿珍', note: '大姐的小名' },
    ],
  });
  const daJie = merged.entries.filter((e) => e.label === '大姐');
  assert.equal(daJie.length, 1, '同 label 不应重复');
  assert.equal(daJie[0].note, '新说明：1955 年生', '应更新为新说明');
  assert.ok(merged.entries.some((e) => e.label === '阿珍'), '新条目应追加');
});

test('mergeStoryBible: 条目数超上限时硬性截断（不靠模型自律）', () => {
  const many = Array.from({ length: 100 }, (_, i) => ({
    id: `e${i}`,
    category: 'term' as const,
    label: `词条${i}`,
    note: `说明${i}`,
  }));
  const merged = mergeStoryBible({ entries: [] }, { entries: many });
  assert.ok(merged.entries.length <= MAX_STORY_BIBLE_ENTRIES, '合并后条目数不得超过上限');
});

test('parseStoryBibleEntries: 从模型 JSON 输出里解析条目，脏输入不炸', () => {
  const raw = `好的，我整理如下：
[
  {"category":"character","label":"大姐","note":"大女儿"},
  {"category":"style","label":"语气","note":"温和口语"}
]`;
  const entries = parseStoryBibleEntries(raw);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].category, 'character');
  assert.ok(entries[0].id, '应补上稳定 id');
  // 脏输入
  assert.deepEqual(parseStoryBibleEntries('模型没有输出 JSON'), []);
  assert.deepEqual(parseStoryBibleEntries('[{"label":"缺category"}]'), []);
});
