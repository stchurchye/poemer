import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SHIREN_EXPORT_FORMAT_VERSION,
  createEmptyPersistedStore,
  isPersistedStore,
  isShirenExportBundle,
  makeShirenExportBundle,
} from './persistedStore.js';

test('createEmptyPersistedStore returns all persisted collections', () => {
  const store = createEmptyPersistedStore();
  assert.deepEqual(store, {
    documents: [],
    revisions: [],
    chatSessions: [],
    chatMessages: {},
    writingAssistantMessages: {},
  });
});

test('isPersistedStore accepts the empty store shape', () => {
  assert.equal(isPersistedStore(createEmptyPersistedStore()), true);
});

test('isPersistedStore rejects missing collections', () => {
  assert.equal(isPersistedStore({ documents: [] }), false);
});

test('isPersistedStore rejects document without id or chapters', () => {
  const bad = createEmptyPersistedStore();
  bad.documents.push({ title: 'x' } as never);
  assert.equal(isPersistedStore(bad), false);
});

test('makeShirenExportBundle wraps store without SecureStore values', () => {
  const bundle = makeShirenExportBundle(createEmptyPersistedStore(), {
    appVersion: '1.0.0',
    exportedAt: '2026-05-22T12:00:00.000Z',
  });
  assert.equal(bundle.formatVersion, SHIREN_EXPORT_FORMAT_VERSION);
  assert.equal(bundle.appVersion, '1.0.0');
  assert.equal(isShirenExportBundle(bundle), true);
  assert.equal('deepseekApiKey' in bundle, false);
});

test('isShirenExportBundle rejects unsupported versions', () => {
  const bundle = makeShirenExportBundle(createEmptyPersistedStore(), {
    appVersion: '1.0.0',
    exportedAt: '2026-05-22T12:00:00.000Z',
  });
  assert.equal(isShirenExportBundle({ ...bundle, formatVersion: 999 }), false);
});
