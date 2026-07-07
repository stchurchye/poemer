import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getModelProfile,
  DEFAULT_MODEL_PROFILE,
  listKnownModelIds,
} from './modelProfile.js';

test('getModelProfile returns real window for gpt-5.4', () => {
  const p = getModelProfile('openai/gpt-5.4');
  assert.equal(p.contextWindowTokens, 272_000);
  assert.equal(p.maxCompletionTokens, 128_000);
});

test('getModelProfile returns ~1M window for gemini flash-lite', () => {
  const p = getModelProfile('google/gemini-3.1-flash-lite');
  assert.equal(p.contextWindowTokens, 1_048_576);
  assert.equal(p.maxCompletionTokens, 65_536);
});

test('unknown / missing model falls back to conservative default', () => {
  assert.deepEqual(getModelProfile('some/unknown-model'), DEFAULT_MODEL_PROFILE);
  assert.deepEqual(getModelProfile(undefined), DEFAULT_MODEL_PROFILE);
  assert.deepEqual(getModelProfile(null), DEFAULT_MODEL_PROFILE);
  // 兜底窗口不得大于任一真实模型上限，避免乐观放行
  assert.ok(DEFAULT_MODEL_PROFILE.contextWindowTokens <= 272_000);
  assert.ok(DEFAULT_MODEL_PROFILE.maxCompletionTokens <= 8_192);
});

test('flash-lite window is far larger than gpt window (保原文: 多留逐字)', () => {
  assert.ok(
    getModelProfile('google/gemini-3.1-flash-lite').contextWindowTokens >
      getModelProfile('openai/gpt-5.4').contextWindowTokens,
  );
  assert.ok(listKnownModelIds().length >= 2);
});
