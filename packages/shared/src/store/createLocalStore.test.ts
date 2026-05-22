import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyPersistedStore } from '../persistedStore.js';
import { createLocalStore } from './createLocalStore.js';

test('createDocument uses chapter order 0 like db.ts', () => {
  const store = createLocalStore(createEmptyPersistedStore(), {
    now: () => '2026-05-22T00:00:00.000Z',
    uuid: (() => {
      const ids = ['doc-1', 'chapter-1', 'block-1'];
      return () => ids.shift() ?? 'extra-id';
    })(),
  });

  const doc = store.createDocument('我的文章');

  assert.equal(doc.id, 'doc-1');
  assert.equal(doc.chapters[0]?.order, 0);
  assert.equal(doc.hiddenAt, null);
});

test('createRevision supersedes prior pending on same block', () => {
  const store = createLocalStore(createEmptyPersistedStore(), {
    now: () => '2026-05-22T00:00:00.000Z',
    uuid: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
  });
  const doc = store.createDocument('文');
  const blockId = doc.chapters[0]!.blocks[0]!.id;
  const r1 = store.createRevision({
    documentId: doc.id,
    blockId,
    parentRevisionId: null,
    snapshot: 'a',
    previousSnapshot: '',
    summary: '1',
    source: 'ai',
    status: 'pending',
  });
  const r2 = store.createRevision({
    documentId: doc.id,
    blockId,
    parentRevisionId: null,
    snapshot: 'b',
    previousSnapshot: '',
    summary: '2',
    source: 'ai',
    status: 'pending',
  });
  assert.equal(store.getRevision(r1.id)?.status, 'rejected');
  assert.equal(store.getRevision(r2.id)?.status, 'pending');
});

test('acceptRevision applies snapshot to matching block', () => {
  const store = createLocalStore(createEmptyPersistedStore(), {
    now: () => '2026-05-22T00:00:00.000Z',
    uuid: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
  });
  const doc = store.createDocument('文章');
  const blockId = doc.chapters[0]!.blocks[0]!.id;
  const rev = store.createRevision({
    documentId: doc.id,
    blockId,
    parentRevisionId: null,
    snapshot: '修改后',
    previousSnapshot: '',
    summary: '测试改稿',
    source: 'ai',
    status: 'pending',
  });

  store.acceptRevision(rev.id);
  const updated = store.getDocument(doc.id);
  assert.equal(updated?.chapters[0]!.blocks[0]!.content, '修改后');
  assert.equal(store.getRevision(rev.id)?.status, 'accepted');
});

test('chat messages are stored under their session', () => {
  const store = createLocalStore(createEmptyPersistedStore(), {
    now: () => '2026-05-22T00:00:00.000Z',
    uuid: (() => {
      const ids = ['session-1', 'msg-1'];
      return () => ids.shift() ?? 'extra-id';
    })(),
  });
  const session = store.createChatSession('新话题');
  store.addChatMessage(session.id, 'user', '你好');

  assert.equal(store.listChatSessions().length, 1);
  assert.equal(store.getChatMessages(session.id)[0]?.content, '你好');
});

test('rollback creates accepted revision from target snapshot', () => {
  const store = createLocalStore(createEmptyPersistedStore(), {
    now: () => '2026-05-22T00:00:00.000Z',
    uuid: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
  });
  const doc = store.createDocument('文');
  const blockId = doc.chapters[0]!.blocks[0]!.id;
  store.saveDocumentContent(doc.id, doc.chapters[0]!.id, blockId, '初稿');
  const rev = store.createRevision({
    documentId: doc.id,
    blockId,
    parentRevisionId: null,
    snapshot: '旧版',
    previousSnapshot: '初稿',
    summary: '版本 A',
    source: 'ai',
    status: 'accepted',
  });
  store.acceptRevision(rev.id);
  store.saveDocumentContent(doc.id, doc.chapters[0]!.id, blockId, '新版');

  const rolled = store.rollback(doc.id, rev.id);
  assert.equal(rolled?.source, 'rollback');
  assert.equal(rolled?.status, 'accepted');
  assert.equal(store.getDocument(doc.id)?.chapters[0]!.blocks[0]!.content, '旧版');
});
