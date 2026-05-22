# Local-First Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the app from “mobile client + self-hosted API stores data” to “mobile stores all user data locally, exports/imports one data package, and calls model vendors directly for AI.”

**Architecture:** Keep the existing UI-facing API shape, but replace HTTP persistence with a local `PersistedStore` backed by a JSON file on device. Extract shared, runtime-agnostic types and engine boundaries so `apps/mobile` and a future backend can share the same business logic instead of forking.

**Tech Stack:** TypeScript, Expo React Native, `expo-file-system`, `expo-sharing`, `expo-secure-store`, Node test runner (`node --test`) for pure modules, existing `@shiren/shared` types/prompts.

---

## Scope Check

This is a large architectural change. Implement it in layers and keep each task shippable:

1. Shared data bundle types and validation.
2. Pure in-memory store with CRUD and revision behavior.
3. Mobile file persistence, backup, export, import.
4. Local API facade for non-AI flows.
5. Local model/engine boundary for AI flows.
6. UI migration and local-mode copy.
7. Documentation and final verification.

Do not attempt automatic cloud sync, merge import, export encryption, or offline AI in this plan.

---

## File Structure

### Shared

- Create `packages/shared/src/persistedStore.ts`  
  Defines `PersistedStore`, `ShirenExportBundle`, constants, empty-store factory, validation helpers.
- Modify `packages/shared/src/index.ts`  
  Exports persisted-store types/helpers.
- Create `packages/shared/src/store/createLocalStore.ts`  
  Pure in-memory store factory with CRUD methods. This keeps core data behavior testable outside React Native.
- Create `packages/shared/src/store/createLocalStore.test.ts`  
  Node test-runner coverage for create/list/update/revisions/chat/import validation.
- Modify `packages/shared/package.json`  
  Adds a `test` script using `tsc` then `node --test dist/**/*.test.js`.

### Mobile Local Persistence

- Create `apps/mobile/src/lib/localDataFiles.ts`  
  Expo file-system paths, atomic-ish save flow, backup recovery, import/export file helpers.
- Create `apps/mobile/src/lib/localDataFiles.test.ts` only if the test runner can mock file access cleanly; otherwise keep file operations verified through manual QA and typecheck.
- Create `apps/mobile/src/context/LocalStoreContext.tsx`  
  Loads local store on startup, exposes local store and refresh generation.
- Modify `apps/mobile/App.tsx`  
  Adds `LocalStoreProvider`.

### Mobile API Facade

- Create `apps/mobile/src/lib/localApi.ts`  
  Implements the existing `api` method shapes for local CRUD first. AI methods initially delegate to engine stubs or existing vendor clients as tasks progress.
- Modify `apps/mobile/src/lib/api.ts`  
  Re-export local API by default in local-first mode, or replace the exported `api` object with local implementation.

### Engine / Model Boundary

- Create `packages/engine/package.json`, `packages/engine/tsconfig.json`, `packages/engine/src/index.ts`  
  New workspace package for runtime-agnostic AI orchestration.
- Create `packages/engine/src/modelClient.ts`  
  Interface for chat/completion calls; no SecureStore, no Hono.
- Create `packages/engine/src/writingEngine.ts`  
  Local writing assistant intent/confirm/revision orchestration.
- Create `packages/engine/src/chatEngine.ts`  
  Local chat send/intent orchestration.
- Modify `apps/mobile/package.json`  
  Adds `@shiren/engine: "*"` dependency.

### Mobile UI

- Modify `apps/mobile/src/screens/MeScreen.tsx`  
  Adds local data status, export, import, and local-first explanation.
- Modify `apps/mobile/src/locales/zh-CN.ts`  
  Adds local data copy and model-network copy; removes server-centric copy from visible local mode.
- Modify `apps/mobile/src/navigation/RootTabs.tsx` and connectivity components as needed  
  Removes global server banner from local mode; model errors stay local to actions.

### Docs

- Modify `docs/AGENTS.md`  
  Updates project principles from server-source-of-truth to local-first.
- Modify `docs/项目介绍.md`  
  Updates “数据存在哪” for family-facing docs.
- Add `docs/local-first-data.md`  
  User/maintainer guide for export/import and future backend migration.

---

## Task 1: Shared Persisted Store Types and Validation

**Files:**
- Create: `packages/shared/src/persistedStore.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json`
- Test: `packages/shared/src/persistedStore.test.ts`

- [ ] **Step 1: Write the failing validation tests**

Create `packages/shared/src/persistedStore.test.ts`:

```ts
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
```

- [ ] **Step 2: Add package test script**

Modify `packages/shared/package.json` scripts:

```json
"scripts": {
  "build": "tsc",
  "typecheck": "tsc --noEmit",
  "test": "npm run build && node --test \"dist/**/*.test.js\"",
  "dev": "tsc --watch"
}
```

- [ ] **Step 3: Run the tests to verify failure**

Run:

```bash
npm run test -w @shiren/shared
```

Expected: TypeScript fails because `persistedStore.ts` does not exist.

- [ ] **Step 4: Implement shared persisted-store module**

Create `packages/shared/src/persistedStore.ts`:

```ts
import type {
  ChatMessage,
  ChatSession,
  Document,
  Revision,
  WritingAssistantMessage,
} from './types.js';

export const SHIREN_EXPORT_FORMAT_VERSION = 1;

export interface PersistedStore {
  documents: Document[];
  revisions: Revision[];
  chatSessions: ChatSession[];
  chatMessages: Record<string, ChatMessage[]>;
  writingAssistantMessages: Record<string, WritingAssistantMessage[]>;
}

export interface ShirenExportBundle {
  formatVersion: typeof SHIREN_EXPORT_FORMAT_VERSION;
  exportedAt: string;
  appVersion: string;
  store: PersistedStore;
}

export function createEmptyPersistedStore(): PersistedStore {
  return {
    documents: [],
    revisions: [],
    chatSessions: [],
    chatMessages: {},
    writingAssistantMessages: {},
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecordOfArrays(value: unknown): value is Record<string, unknown[]> {
  return (
    isObject(value) &&
    Object.values(value).every((entry) => Array.isArray(entry))
  );
}

export function isPersistedStore(value: unknown): value is PersistedStore {
  if (!isObject(value)) return false;
  return (
    Array.isArray(value.documents) &&
    Array.isArray(value.revisions) &&
    Array.isArray(value.chatSessions) &&
    isRecordOfArrays(value.chatMessages) &&
    isRecordOfArrays(value.writingAssistantMessages)
  );
}

export function makeShirenExportBundle(
  store: PersistedStore,
  options?: {
    appVersion?: string;
    exportedAt?: string;
  },
): ShirenExportBundle {
  return {
    formatVersion: SHIREN_EXPORT_FORMAT_VERSION,
    exportedAt: options?.exportedAt ?? new Date().toISOString(),
    appVersion: options?.appVersion ?? 'unknown',
    store,
  };
}

export function isShirenExportBundle(value: unknown): value is ShirenExportBundle {
  if (!isObject(value)) return false;
  return (
    value.formatVersion === SHIREN_EXPORT_FORMAT_VERSION &&
    typeof value.exportedAt === 'string' &&
    typeof value.appVersion === 'string' &&
    isPersistedStore(value.store)
  );
}
```

- [ ] **Step 5: Export the module**

Modify `packages/shared/src/index.ts`:

```ts
export * from './persistedStore.js';
```

Keep existing exports intact.

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
npm run test -w @shiren/shared
npm run typecheck -w @shiren/shared
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/package.json packages/shared/src/index.ts packages/shared/src/persistedStore.ts packages/shared/src/persistedStore.test.ts
git commit -m "feat(shared): add persisted store export bundle types"
```

---

## Task 2: Pure LocalStore Core

**Files:**
- Create: `packages/shared/src/store/createLocalStore.ts`
- Create: `packages/shared/src/store/createLocalStore.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing LocalStore tests**

Create `packages/shared/src/store/createLocalStore.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmptyPersistedStore,
  createLocalStore,
} from '../index.js';

test('createDocument creates one document with one empty chapter and block', () => {
  const store = createLocalStore(createEmptyPersistedStore(), {
    now: () => '2026-05-22T00:00:00.000Z',
    uuid: (() => {
      const ids = ['doc-1', 'chapter-1', 'block-1'];
      return () => ids.shift() ?? 'extra-id';
    })(),
  });

  const doc = store.createDocument('我的文章');

  assert.equal(doc.id, 'doc-1');
  assert.equal(doc.title, '我的文章');
  assert.equal(doc.chapters.length, 1);
  assert.equal(doc.chapters[0]?.id, 'chapter-1');
  assert.equal(doc.chapters[0]?.blocks[0]?.id, 'block-1');
  assert.deepEqual(store.listDocuments().map((d) => d.id), ['doc-1']);
});

test('updateDocument persists changes and updatedAt', () => {
  const store = createLocalStore(createEmptyPersistedStore(), {
    now: (() => {
      const times = ['2026-05-22T00:00:00.000Z', '2026-05-22T00:01:00.000Z'];
      return () => times.shift() ?? '2026-05-22T00:02:00.000Z';
    })(),
    uuid: (() => {
      const ids = ['doc-1', 'chapter-1', 'block-1'];
      return () => ids.shift() ?? 'extra-id';
    })(),
  });
  const doc = store.createDocument('旧标题');
  const updated = store.updateDocument(doc.id, { title: '新标题' });

  assert.equal(updated.title, '新标题');
  assert.equal(updated.updatedAt, '2026-05-22T00:01:00.000Z');
});

test('acceptRevision applies snapshot to matching block', () => {
  const store = createLocalStore(createEmptyPersistedStore(), {
    now: () => '2026-05-22T00:00:00.000Z',
    uuid: (() => {
      const ids = ['doc-1', 'chapter-1', 'block-1', 'rev-1'];
      return () => ids.shift() ?? 'extra-id';
    })(),
  });
  const doc = store.createDocument('文章');
  const blockId = doc.chapters[0]!.blocks[0]!.id;
  const rev = store.createRevision({
    documentId: doc.id,
    blockId,
    snapshot: '修改后',
    previousSnapshot: '',
    summary: '测试改稿',
    source: 'ai',
    status: 'pending',
  });

  const accepted = store.acceptRevision(doc.id, rev.id);
  assert.equal(accepted.currentRevisionId, rev.id);
  assert.equal(accepted.chapters[0]!.blocks[0]!.content, '修改后');
  assert.equal(store.getRevision(doc.id, rev.id).status, 'accepted');
});

test('chat messages are stored under their session', () => {
  const store = createLocalStore(createEmptyPersistedStore(), {
    now: () => '2026-05-22T00:00:00.000Z',
    uuid: (() => {
      const ids = ['session-1', 'msg-1'];
      return () => ids.shift() ?? 'extra-id';
    })(),
  });
  const session = store.createChatSession();
  store.appendChatMessage(session.id, {
    role: 'user',
    content: '你好',
  });

  assert.equal(store.listChatSessions().length, 1);
  assert.equal(store.getChatMessages(session.id)[0]?.content, '你好');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test -w @shiren/shared
```

Expected: fails because `createLocalStore` does not exist.

- [ ] **Step 3: Implement LocalStore**

Create `packages/shared/src/store/createLocalStore.ts`:

```ts
import type {
  ChatMessage,
  ChatSession,
  Document,
  PartialDeep,
  Revision,
  RevisionSource,
  RevisionStatus,
} from '../types.js';
import { formatChapterTitle } from '../document/formatChapterTitle.js';
import type { PersistedStore } from '../persistedStore.js';

type Clock = () => string;
type IdFactory = () => string;

export type CreateRevisionInput = {
  documentId: string;
  blockId: string | null;
  snapshot: string;
  previousSnapshot: string | null;
  summary: string;
  source: RevisionSource;
  status?: RevisionStatus;
  suggestAction?: string;
  suggestInstruction?: string;
  suggestEvaluation?: string;
  suggestRationale?: string;
};

export type AppendChatMessageInput = {
  role: ChatMessage['role'];
  content: string;
};

export type LocalStore = ReturnType<typeof createLocalStore>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function emptyDocument(uuid: IdFactory, now: string, title: string): Document {
  const blockId = uuid();
  return {
    id: uuid(),
    title,
    chapters: [
      {
        id: uuid(),
        title: formatChapterTitle(1),
        order: 1,
        blocks: [{ id: blockId, content: '', currentRevisionId: null }],
        chapterSummary: '',
      },
    ],
    globalSummary: '',
    styleGuide: '',
    currentRevisionId: null,
    revisionCount: 0,
    updatedAt: now,
    createdAt: now,
  };
}
```

Then complete the implementation with these public methods:

```ts
export function createLocalStore(
  initial: PersistedStore,
  deps?: { now?: Clock; uuid?: IdFactory },
) {
  const now = deps?.now ?? (() => new Date().toISOString());
  const uuid = deps?.uuid ?? (() => crypto.randomUUID());
  let data = clone(initial);

  function touchDocument(doc: Document): Document {
    doc.updatedAt = now();
    return doc;
  }

  function findDocument(id: string): Document {
    const doc = data.documents.find((d) => d.id === id);
    if (!doc) throw new Error('DOCUMENT_NOT_FOUND');
    return doc;
  }

  return {
    snapshot(): PersistedStore {
      return clone(data);
    },
    replace(next: PersistedStore): void {
      data = clone(next);
    },
    listDocuments(): Document[] {
      return clone(data.documents).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    createDocument(title: string): Document {
      const timestamp = now();
      const blockId = uuid();
      const doc: Document = {
        id: uuid(),
        title,
        chapters: [
          {
            id: uuid(),
            title: formatChapterTitle(1),
            order: 1,
            blocks: [{ id: blockId, content: '', currentRevisionId: null }],
            chapterSummary: '',
          },
        ],
        globalSummary: '',
        styleGuide: '',
        currentRevisionId: null,
        revisionCount: 0,
        updatedAt: timestamp,
        createdAt: timestamp,
      };
      data.documents.push(doc);
      return clone(doc);
    },
    getDocument(id: string): Document {
      return clone(findDocument(id));
    },
    updateDocument(id: string, patch: Partial<Document>): Document {
      const doc = findDocument(id);
      Object.assign(doc, patch);
      touchDocument(doc);
      return clone(doc);
    },
    addChapter(documentId: string, title?: string): Document {
      const doc = findDocument(documentId);
      const order = doc.chapters.length + 1;
      doc.chapters.push({
        id: uuid(),
        title: title?.trim() || formatChapterTitle(order),
        order,
        blocks: [{ id: uuid(), content: '', currentRevisionId: null }],
        chapterSummary: '',
      });
      touchDocument(doc);
      return clone(doc);
    },
    listRevisions(documentId: string): Revision[] {
      return clone(data.revisions.filter((r) => r.documentId === documentId));
    },
    getRevision(documentId: string, revisionId: string): Revision {
      const rev = data.revisions.find((r) => r.documentId === documentId && r.id === revisionId);
      if (!rev) throw new Error('REVISION_NOT_FOUND');
      return clone(rev);
    },
    createRevision(input: CreateRevisionInput): Revision {
      const timestamp = now();
      const rev: Revision = {
        id: uuid(),
        parentRevisionId: null,
        timezone: 'UTC',
        createdAt: timestamp,
        status: input.status ?? 'pending',
        ...input,
      };
      data.revisions.push(rev);
      const doc = findDocument(input.documentId);
      doc.revisionCount += 1;
      touchDocument(doc);
      return clone(rev);
    },
    acceptRevision(documentId: string, revisionId: string, editedSnapshot?: string): Document {
      const doc = findDocument(documentId);
      const rev = data.revisions.find((r) => r.documentId === documentId && r.id === revisionId);
      if (!rev) throw new Error('REVISION_NOT_FOUND');
      const snapshot = editedSnapshot ?? rev.snapshot;
      for (const chapter of doc.chapters) {
        for (const block of chapter.blocks) {
          if (block.id === rev.blockId) {
            block.content = snapshot;
            block.currentRevisionId = rev.id;
          }
        }
      }
      rev.status = 'accepted';
      doc.currentRevisionId = rev.id;
      touchDocument(doc);
      return clone(doc);
    },
    rejectRevision(documentId: string, revisionId: string): Revision {
      const rev = data.revisions.find((r) => r.documentId === documentId && r.id === revisionId);
      if (!rev) throw new Error('REVISION_NOT_FOUND');
      rev.status = 'rejected';
      return clone(rev);
    },
    createChatSession(): ChatSession {
      const timestamp = now();
      const session: ChatSession = {
        id: uuid(),
        title: '新话题',
        updatedAt: timestamp,
        createdAt: timestamp,
        contextSummary: null,
        contextSummaryUpToMessageId: null,
        lastQuestion: null,
      };
      data.chatSessions.unshift(session);
      data.chatMessages[session.id] = [];
      return clone(session);
    },
    listChatSessions(): ChatSession[] {
      return clone(data.chatSessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    getChatMessages(sessionId: string): ChatMessage[] {
      return clone(data.chatMessages[sessionId] ?? []);
    },
    appendChatMessage(sessionId: string, input: AppendChatMessageInput): ChatMessage {
      const session = data.chatSessions.find((s) => s.id === sessionId);
      if (!session) throw new Error('CHAT_SESSION_NOT_FOUND');
      const timestamp = now();
      const message: ChatMessage = {
        id: uuid(),
        sessionId,
        role: input.role,
        content: input.content,
        createdAt: timestamp,
      };
      data.chatMessages[sessionId] = [...(data.chatMessages[sessionId] ?? []), message];
      session.updatedAt = timestamp;
      if (input.role === 'user') session.lastQuestion = input.content;
      return clone(message);
    },
  };
}
```

Remove the unused `PartialDeep` import if TypeScript reports it. The exact method list may grow in later tasks, but do not add AI logic here.

- [ ] **Step 4: Export LocalStore**

Modify `packages/shared/src/index.ts`:

```ts
export * from './store/createLocalStore.js';
```

- [ ] **Step 5: Run tests**

```bash
npm run test -w @shiren/shared
```

Expected: tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/src/store/createLocalStore.ts packages/shared/src/store/createLocalStore.test.ts
git commit -m "feat(shared): add pure local store"
```

---

## Task 3: Mobile File Persistence for Local Data

**Files:**
- Create: `apps/mobile/src/lib/localDataFiles.ts`
- Modify: `apps/mobile/src/locales/zh-CN.ts`

- [ ] **Step 1: Define file operation contract**

Create `apps/mobile/src/lib/localDataFiles.ts` with imports and constants:

```ts
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import {
  createEmptyPersistedStore,
  isPersistedStore,
  isShirenExportBundle,
  makeShirenExportBundle,
  type PersistedStore,
} from '@shiren/shared';

const ROOT = FileSystem.documentDirectory ?? '';
const STORE_FILE = `${ROOT}shiren-store.json`;
const BACKUP_FILE = `${ROOT}shiren-store.bak.json`;
const TEMP_FILE = `${ROOT}shiren-store.tmp.json`;
const BROKEN_FILE = `${ROOT}shiren-store.broken.json`;

export type LocalDataLoadResult = {
  store: PersistedStore;
  recoveredFromBackup: boolean;
  createdEmpty: boolean;
};

export type LocalDataStatus = {
  exists: boolean;
  bytes: number;
  modifiedAt?: number;
  path: string;
};
```

- [ ] **Step 2: Implement read and recovery**

Append:

```ts
async function readJsonFile(path: string): Promise<unknown | null> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;
  const raw = await FileSystem.readAsStringAsync(path);
  return JSON.parse(raw);
}

export async function loadLocalPersistedStore(): Promise<LocalDataLoadResult> {
  try {
    const main = await readJsonFile(STORE_FILE);
    if (isPersistedStore(main)) {
      return { store: main, recoveredFromBackup: false, createdEmpty: false };
    }
  } catch {
    try {
      const mainInfo = await FileSystem.getInfoAsync(STORE_FILE);
      if (mainInfo.exists) {
        await FileSystem.copyAsync({ from: STORE_FILE, to: BROKEN_FILE });
      }
    } catch {
      // Keep startup resilient; broken-file preservation is best effort.
    }
  }

  try {
    const backup = await readJsonFile(BACKUP_FILE);
    if (isPersistedStore(backup)) {
      await saveLocalPersistedStore(backup);
      return { store: backup, recoveredFromBackup: true, createdEmpty: false };
    }
  } catch {
    // fall through to empty store
  }

  const empty = createEmptyPersistedStore();
  await saveLocalPersistedStore(empty);
  return { store: empty, recoveredFromBackup: false, createdEmpty: true };
}
```

- [ ] **Step 3: Implement backup and atomic-ish save**

Append:

```ts
export async function saveLocalPersistedStore(store: PersistedStore): Promise<void> {
  const existing = await FileSystem.getInfoAsync(STORE_FILE);
  if (existing.exists) {
    await FileSystem.copyAsync({ from: STORE_FILE, to: BACKUP_FILE });
  }

  const json = JSON.stringify(store, null, 2);
  await FileSystem.writeAsStringAsync(TEMP_FILE, json);

  const verifyRaw = await FileSystem.readAsStringAsync(TEMP_FILE);
  const parsed = JSON.parse(verifyRaw);
  if (!isPersistedStore(parsed)) {
    throw new Error('LOCAL_STORE_VERIFY_FAILED');
  }

  await FileSystem.writeAsStringAsync(STORE_FILE, verifyRaw);
  await FileSystem.deleteAsync(TEMP_FILE, { idempotent: true });
}
```

- [ ] **Step 4: Implement status and export**

Append:

```ts
function exportFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join('');
  return `诗人数据-${stamp}.shiren.json`;
}

export async function getLocalDataStatus(): Promise<LocalDataStatus> {
  const info = await FileSystem.getInfoAsync(STORE_FILE, { size: true });
  return {
    exists: info.exists,
    bytes: info.exists ? (info.size ?? 0) : 0,
    modifiedAt: info.exists ? info.modificationTime : undefined,
    path: STORE_FILE,
  };
}

export async function exportLocalDataPackage(store: PersistedStore): Promise<string> {
  const bundle = makeShirenExportBundle(store, {
    appVersion: Constants.expoConfig?.version ?? 'unknown',
  });
  const exportPath = `${FileSystem.cacheDirectory ?? ROOT}${exportFileName()}`;
  await FileSystem.writeAsStringAsync(exportPath, JSON.stringify(bundle, null, 2));
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('SHARING_NOT_AVAILABLE');
  }
  await Sharing.shareAsync(exportPath, {
    mimeType: 'application/json',
    dialogTitle: '导出诗人数据',
    UTI: 'public.json',
  });
  return exportPath;
}
```

- [ ] **Step 5: Implement import parsing**

Append:

```ts
export async function parseImportFile(uri: string): Promise<PersistedStore> {
  const raw = await FileSystem.readAsStringAsync(uri);
  const parsed = JSON.parse(raw) as unknown;
  if (isShirenExportBundle(parsed)) return parsed.store;
  if (isPersistedStore(parsed)) return parsed;
  throw new Error('INVALID_SHIREN_DATA_PACKAGE');
}

export async function replaceLocalDataFromImport(store: PersistedStore): Promise<void> {
  await saveLocalPersistedStore(store);
}
```

- [ ] **Step 6: Add local-data copy**

Modify `apps/mobile/src/locales/zh-CN.ts` under `me`:

```ts
localDataTitle: '本地数据',
localDataMode: '文章和聊天记录只存在本机',
localDataAiHint: 'AI 改稿、问问题、云端识图和云端听写需要联网访问模型服务',
localDataExport: '导出数据包',
localDataImport: '导入数据包',
localDataExportDone: '数据包已导出',
localDataExportFailed: '数据包导出失败',
localDataImportConfirmTitle: '导入数据包',
localDataImportConfirmMessage: '导入后会替换本机现有文章和聊天记录。当前数据会先自动备份。',
localDataImportDone: '数据已导入',
localDataImportFailed: '数据包导入失败',
localDataRecovered: '已从备份恢复本地数据',
```

- [ ] **Step 7: Typecheck**

Run:

```bash
npm run typecheck -w @shiren/mobile
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/lib/localDataFiles.ts apps/mobile/src/locales/zh-CN.ts
git commit -m "feat(mobile): add local data file persistence"
```

---

## Task 4: LocalStore Provider and Startup Hydration

**Files:**
- Create: `apps/mobile/src/context/LocalStoreContext.tsx`
- Modify: `apps/mobile/App.tsx`

- [ ] **Step 1: Create provider**

Create `apps/mobile/src/context/LocalStoreContext.tsx`:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  createLocalStore,
  type LocalStore,
  type PersistedStore,
} from '@shiren/shared';
import {
  loadLocalPersistedStore,
  saveLocalPersistedStore,
} from '../lib/localDataFiles';
import { appAlert } from '../lib/appAlert';
import { zh } from '../locales/zh-CN';

type LocalStoreContextValue = {
  store: LocalStore | null;
  ready: boolean;
  generation: number;
  snapshot: () => PersistedStore | null;
  persistNow: () => Promise<void>;
  replaceStore: (next: PersistedStore) => Promise<void>;
  markChanged: () => void;
};

const LocalStoreContext = createContext<LocalStoreContextValue | null>(null);
const SAVE_DEBOUNCE_MS = 400;
```

- [ ] **Step 2: Implement provider body**

Append:

```tsx
export function LocalStoreProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<LocalStore | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);

  const persistNow = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return;
    await saveLocalPersistedStore(store.snapshot());
  }, []);

  const markChanged = useCallback(() => {
    setGeneration((n) => n + 1);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persistNow();
    }, SAVE_DEBOUNCE_MS);
  }, [persistNow]);

  const replaceStore = useCallback(
    async (next: PersistedStore) => {
      storeRef.current = createLocalStore(next);
      await saveLocalPersistedStore(next);
      setGeneration((n) => n + 1);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadLocalPersistedStore();
      if (cancelled) return;
      storeRef.current = createLocalStore(result.store);
      setReady(true);
      setGeneration((n) => n + 1);
      if (result.recoveredFromBackup) {
        appAlert('提示', zh.me.localDataRecovered);
      }
    })();
    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      void persistNow();
    };
  }, [persistNow]);

  const value = useMemo(
    () => ({
      store: storeRef.current,
      ready,
      generation,
      snapshot: () => storeRef.current?.snapshot() ?? null,
      persistNow,
      replaceStore,
      markChanged,
    }),
    [ready, generation, persistNow, replaceStore, markChanged],
  );

  return (
    <LocalStoreContext.Provider value={value}>
      {children}
    </LocalStoreContext.Provider>
  );
}

export function useLocalStore(): LocalStoreContextValue {
  const ctx = useContext(LocalStoreContext);
  if (!ctx) throw new Error('useLocalStore must be used within LocalStoreProvider');
  return ctx;
}
```

- [ ] **Step 3: Wrap App**

Modify `apps/mobile/App.tsx`:

```tsx
import { LocalStoreProvider } from './src/context/LocalStoreContext';
```

Wrap `RootTabs` inside `LocalStoreProvider`, inside existing providers:

```tsx
<LocalStoreProvider>
  <NavigationContainer>
    <StatusBar style="dark" />
    <RootTabs />
  </NavigationContainer>
</LocalStoreProvider>
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck -w @shiren/mobile
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/App.tsx apps/mobile/src/context/LocalStoreContext.tsx
git commit -m "feat(mobile): hydrate local store on startup"
```

---

## Task 5: Local API for Document and Revision Flows

**Files:**
- Create: `apps/mobile/src/lib/localApi.ts`
- Modify: `apps/mobile/src/lib/api.ts`
- Modify: screens only if method return shapes differ

- [ ] **Step 1: Create local API wrapper shape**

Create `apps/mobile/src/lib/localApi.ts`:

```ts
import type { Document, Revision } from '@shiren/shared';
import type { LocalStore } from '@shiren/shared';

type ApiResult<T> = { ok: true; data: T; requestId: string };

function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data, requestId: `local-${Date.now()}` };
}

function requireStore(store: LocalStore | null): LocalStore {
  if (!store) throw new Error('LOCAL_STORE_NOT_READY');
  return store;
}

export function createLocalApi(deps: {
  getStore: () => LocalStore | null;
  markChanged: () => void;
}) {
  function store() {
    return requireStore(deps.getStore());
  }

  return {
    health: async () => ok({ service: '诗人-local' }),
    listDocuments: async () => ok(store().listDocuments()),
    createDocument: async (title: string) => {
      const doc = store().createDocument(title);
      deps.markChanged();
      return ok(doc);
    },
    getDocument: async (id: string) => ok(store().getDocument(id)),
    updateDocument: async (id: string, patch: Partial<Document>) => {
      const doc = store().updateDocument(id, patch);
      deps.markChanged();
      return ok(doc);
    },
    addChapter: async (documentId: string, title?: string) => {
      const doc = store().addChapter(documentId, title);
      deps.markChanged();
      return ok(doc);
    },
    listRevisions: async (documentId: string) => ok(store().listRevisions(documentId)),
    getRevision: async (documentId: string, revisionId: string) =>
      ok(store().getRevision(documentId, revisionId)),
    acceptRevision: async (documentId: string, revisionId: string, editedSnapshot?: string) => {
      const doc = store().acceptRevision(documentId, revisionId, editedSnapshot);
      deps.markChanged();
      return ok(doc);
    },
    rejectRevision: async (documentId: string, revisionId: string) => {
      const rev = store().rejectRevision(documentId, revisionId);
      deps.markChanged();
      return ok(rev);
    },
  };
}
```

- [ ] **Step 2: Add local API context bridge**

Because `api.ts` is currently imported as a module singleton, introduce an injectable current local store:

Create `apps/mobile/src/lib/localApiRuntime.ts`:

```ts
import type { LocalStore } from '@shiren/shared';

let getStoreRef: () => LocalStore | null = () => null;
let markChangedRef: () => void = () => {};

export function registerLocalApiRuntime(handlers: {
  getStore: () => LocalStore | null;
  markChanged: () => void;
}): () => void {
  getStoreRef = handlers.getStore;
  markChangedRef = handlers.markChanged;
  return () => {
    getStoreRef = () => null;
    markChangedRef = () => {};
  };
}

export function getLocalApiRuntime() {
  return {
    getStore: getStoreRef,
    markChanged: markChangedRef,
  };
}
```

- [ ] **Step 3: Register runtime in provider**

Modify `LocalStoreContext.tsx`:

```tsx
import { registerLocalApiRuntime } from '../lib/localApiRuntime';
```

Add effect after `markChanged` is defined:

```tsx
useEffect(() => {
  return registerLocalApiRuntime({
    getStore: () => storeRef.current,
    markChanged,
  });
}, [markChanged]);
```

- [ ] **Step 4: Switch `api.ts` document methods to local**

Modify `apps/mobile/src/lib/api.ts`:

```ts
import { createLocalApi } from './localApi';
import { getLocalApiRuntime } from './localApiRuntime';

const local = () => createLocalApi(getLocalApiRuntime());
```

Replace these methods in exported `api`:

```ts
health: () => local().health(),
listDocuments: () => local().listDocuments(),
createDocument: (title: string) => local().createDocument(title),
getDocument: (id: string) => local().getDocument(id),
updateDocument: (id: string, patch: Partial<Document>) => local().updateDocument(id, patch),
addChapter: (documentId: string, title?: string) => local().addChapter(documentId, title),
listRevisions: (documentId: string) => local().listRevisions(documentId),
getRevision: (documentId: string, revisionId: string) => local().getRevision(documentId, revisionId),
acceptRevision: (documentId: string, revisionId: string, editedSnapshot?: string) =>
  local().acceptRevision(documentId, revisionId, editedSnapshot),
rejectRevision: (documentId: string, revisionId: string) =>
  local().rejectRevision(documentId, revisionId),
```

Leave AI/chat/assistant methods HTTP for this task only if they are not implemented yet. Do not add a placeholder comment in committed code; Task 9 replaces them with engine-backed local implementations.

- [ ] **Step 5: Typecheck and manual smoke**

Run:

```bash
npm run typecheck -w @shiren/mobile
```

Expected: pass.

Manual smoke in simulator/device:

1. Start app with no API server.
2. Writing tab creates or loads a local document.
3. Edit body and navigate away/back.
4. App does not show “连不上服务器” for basic writing actions.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/localApi.ts apps/mobile/src/lib/localApiRuntime.ts apps/mobile/src/lib/api.ts apps/mobile/src/context/LocalStoreContext.tsx
git commit -m "feat(mobile): route document flows through local api"
```

---

## Task 6: Local Chat and Writing Assistant Message Persistence

**Files:**
- Modify: `packages/shared/src/store/createLocalStore.ts`
- Modify: `packages/shared/src/store/createLocalStore.test.ts`
- Modify: `apps/mobile/src/lib/localApi.ts`
- Modify: `apps/mobile/src/lib/api.ts`

- [ ] **Step 1: Add tests for assistant messages and chat sessions**

Append to `createLocalStore.test.ts`:

```ts
test('writing assistant messages are stored by document id', () => {
  const store = createLocalStore(createEmptyPersistedStore(), {
    now: () => '2026-05-22T00:00:00.000Z',
    uuid: (() => {
      const ids = ['doc-1', 'chapter-1', 'block-1', 'msg-1'];
      return () => ids.shift() ?? 'extra-id';
    })(),
  });
  const doc = store.createDocument('文章');
  store.appendWritingAssistantMessage(doc.id, {
    role: 'user',
    content: '帮我润色',
    kind: 'chat',
  });

  assert.equal(store.getWritingAssistantMessages(doc.id)[0]?.content, '帮我润色');
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm run test -w @shiren/shared
```

Expected: `appendWritingAssistantMessage` missing.

- [ ] **Step 3: Implement assistant message methods**

Modify `createLocalStore.ts` imports to include `WritingAssistantMessage`.

Add input type:

```ts
export type AppendWritingAssistantMessageInput = {
  role: WritingAssistantMessage['role'];
  content: string;
  kind: WritingAssistantMessage['kind'];
  pendingAction?: string;
  pendingInstruction?: string;
  confirmStatus?: WritingAssistantMessage['confirmStatus'];
  revisionId?: string;
  suggestEvaluation?: string;
  suggestRationale?: string;
  suggestAction?: string;
  suggestUnderstandingScope?: WritingAssistantMessage['suggestUnderstandingScope'];
};
```

Add methods:

```ts
getWritingAssistantMessages(documentId: string): WritingAssistantMessage[] {
  return clone(data.writingAssistantMessages[documentId] ?? []);
},
appendWritingAssistantMessage(
  documentId: string,
  input: AppendWritingAssistantMessageInput,
): WritingAssistantMessage {
  findDocument(documentId);
  const message: WritingAssistantMessage = {
    id: uuid(),
    documentId,
    createdAt: now(),
    ...input,
  };
  data.writingAssistantMessages[documentId] = [
    ...(data.writingAssistantMessages[documentId] ?? []),
    message,
  ];
  return clone(message);
},
updateWritingAssistantMessage(
  documentId: string,
  messageId: string,
  patch: Partial<WritingAssistantMessage>,
): WritingAssistantMessage {
  const list = data.writingAssistantMessages[documentId] ?? [];
  const message = list.find((m) => m.id === messageId);
  if (!message) throw new Error('WRITING_ASSISTANT_MESSAGE_NOT_FOUND');
  Object.assign(message, patch);
  return clone(message);
},
```

- [ ] **Step 4: Add local API methods**

Modify `apps/mobile/src/lib/localApi.ts`:

```ts
getWritingAssistantMessages: async (documentId: string) =>
  ok(store().getWritingAssistantMessages(documentId)),
```

Add chat methods:

```ts
listChatSessions: async () => ok(store().listChatSessions()),
createChatSession: async () => {
  const session = store().createChatSession();
  deps.markChanged();
  return ok(session);
},
getChatMessages: async (sessionId: string) => ok(store().getChatMessages(sessionId)),
```

- [ ] **Step 5: Route non-AI chat/assistant reads in `api.ts`**

Replace:

```ts
listChatSessions: () => local().listChatSessions(),
createChatSession: () => local().createChatSession(),
getChatMessages: (sessionId: string) => local().getChatMessages(sessionId),
getWritingAssistantMessages: (documentId: string) =>
  local().getWritingAssistantMessages(documentId),
```

Keep send/analyze/confirm for engine task.

- [ ] **Step 6: Run tests and typecheck**

```bash
npm run test -w @shiren/shared
npm run typecheck -w @shiren/mobile
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/store/createLocalStore.ts packages/shared/src/store/createLocalStore.test.ts apps/mobile/src/lib/localApi.ts apps/mobile/src/lib/api.ts
git commit -m "feat: persist chat and assistant messages locally"
```

---

## Task 7: Minimal Engine Package and Direct DeepSeek Client Boundary

**Files:**
- Create: `packages/engine/package.json`
- Create: `packages/engine/tsconfig.json`
- Create: `packages/engine/src/index.ts`
- Create: `packages/engine/src/modelClient.ts`
- Create: `packages/engine/src/chatEngine.ts`
- Create: `packages/engine/src/writingEngine.ts`
- Modify: `apps/mobile/package.json`
- Modify: root `package.json` only if workspace scripts need no changes (workspaces already include `packages/*`)

- [ ] **Step 1: Create package files**

Create `packages/engine/package.json`:

```json
{
  "name": "@shiren/engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@shiren/shared": "*"
  },
  "devDependencies": {
    "typescript": "^5.8.3"
  }
}
```

Create `packages/engine/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

If `tsconfig.base.json` does not exist, copy the style from `packages/shared/tsconfig.json`.

- [ ] **Step 2: Define model client interface**

Create `packages/engine/src/modelClient.ts`:

```ts
export type ModelMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ModelCompletionInput = {
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
};

export type ModelCompletionResult = {
  text: string;
};

export interface ModelClient {
  complete(input: ModelCompletionInput): Promise<ModelCompletionResult>;
}
```

- [ ] **Step 3: Add minimal chat engine**

Create `packages/engine/src/chatEngine.ts`:

```ts
import type { ChatMessage, ChatSession } from '@shiren/shared';
import type { ModelClient } from './modelClient.js';

export type ChatEngineInput = {
  session: ChatSession;
  history: ChatMessage[];
  userText: string;
};

export async function generateChatReply(
  model: ModelClient,
  input: ChatEngineInput,
): Promise<string> {
  const history = input.history.slice(-12).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const res = await model.complete({
    messages: [
      {
        role: 'system',
        content:
          '你是「写作小助手」，陪长辈聊天解惑。语气温柔、有耐心。全部用中文回复。',
      },
      ...history,
      { role: 'user', content: input.userText },
    ],
  });
  return res.text.trim();
}
```

- [ ] **Step 4: Add minimal writing engine**

Create `packages/engine/src/writingEngine.ts`:

```ts
import type { WritingUnderstandingScope } from '@shiren/shared';
import type { ModelClient } from './modelClient.js';

export type WritingIntentResult = {
  displayText: string;
  action: string;
  instruction: string;
  understandingScope: WritingUnderstandingScope;
};

export async function analyzeWritingIntentLocal(
  model: ModelClient,
  input: { content: string; chapterTitle: string; chapterContent: string },
): Promise<WritingIntentResult> {
  const res = await model.complete({
    messages: [
      {
        role: 'system',
        content:
          '请把用户对文章的修改要求整理成一个明确动作。只返回 JSON：displayText, action, instruction, understandingScope。',
      },
      {
        role: 'user',
        content: `章节标题：${input.chapterTitle}\n章节内容：${input.chapterContent}\n用户要求：${input.content}`,
      },
    ],
  });
  try {
    const parsed = JSON.parse(res.text) as Partial<WritingIntentResult>;
    return {
      displayText: parsed.displayText || input.content,
      action: parsed.action || '润色',
      instruction: parsed.instruction || input.content,
      understandingScope: parsed.understandingScope || 'current_chapter',
    };
  } catch {
    return {
      displayText: input.content,
      action: '润色',
      instruction: input.content,
      understandingScope: 'current_chapter',
    };
  }
}

export async function generateRevisionSnapshotLocal(
  model: ModelClient,
  input: { action: string; instruction: string; chapterContent: string },
): Promise<{ newText: string; comment: string }> {
  const res = await model.complete({
    messages: [
      {
        role: 'system',
        content:
          '你是写作小助手。根据用户要求修改正文，只输出修改后的正文，不要解释。',
      },
      {
        role: 'user',
        content: `动作：${input.action}\n要求：${input.instruction}\n正文：\n${input.chapterContent}`,
      },
    ],
  });
  return {
    newText: res.text.trim(),
    comment: '已根据您的要求改好，请看一看。',
  };
}
```

- [ ] **Step 5: Export engine**

Create `packages/engine/src/index.ts`:

```ts
export * from './modelClient.js';
export * from './chatEngine.js';
export * from './writingEngine.js';
```

- [ ] **Step 6: Add mobile dependency**

Modify `apps/mobile/package.json` dependencies:

```json
"@shiren/engine": "*",
```

- [ ] **Step 7: Build/typecheck**

Run:

```bash
npm install
npm run build -w @shiren/shared
npm run typecheck -w @shiren/engine
npm run typecheck -w @shiren/mobile
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add package-lock.json apps/mobile/package.json packages/engine
git commit -m "feat(engine): add local model orchestration package"
```

---

## Task 8: Mobile Direct DeepSeek Model Client

**Files:**
- Create: `apps/mobile/src/lib/localModelClient.ts`
- Modify: `apps/mobile/src/lib/apiError.ts` or localized copy if needed

- [ ] **Step 1: Implement direct model client**

Create `apps/mobile/src/lib/localModelClient.ts`:

```ts
import type { ModelClient, ModelCompletionInput } from '@shiren/engine';
import { DEEPSEEK_BASE_URL, DEEPSEEK_MODEL_PRO } from '@shiren/shared';
import { getDeepSeekApiKey } from './deepseekKey';

export class LocalModelError extends Error {
  constructor(
    message: string,
    public readonly code: 'MODEL_KEY_MISSING' | 'MODEL_NETWORK' | 'MODEL_BAD_RESPONSE',
    public readonly hint?: string,
  ) {
    super(message);
    this.name = 'LocalModelError';
  }
}

export function createDeepSeekModelClient(): ModelClient {
  return {
    async complete(input: ModelCompletionInput) {
      const key = await getDeepSeekApiKey();
      if (!key) {
        throw new LocalModelError(
          '请先在设置里填写小助手密钥',
          'MODEL_KEY_MISSING',
          '文章和聊天记录仍在本机；只有 AI 改稿和问问题需要密钥。',
        );
      }
      try {
        const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: DEEPSEEK_MODEL_PRO,
            messages: input.messages,
            temperature: input.temperature ?? 0.3,
            max_tokens: input.maxTokens,
          }),
        });
        const json = await res.json();
        const text = json?.choices?.[0]?.message?.content;
        if (!res.ok || typeof text !== 'string') {
          throw new LocalModelError(
            'AI 模型暂时没响应',
            'MODEL_BAD_RESPONSE',
            '请稍后再试，或检查密钥是否仍然可用。',
          );
        }
        return { text };
      } catch (e) {
        if (e instanceof LocalModelError) throw e;
        throw new LocalModelError(
          'AI 模型暂时连不上',
          'MODEL_NETWORK',
          '请检查手机网络后再试。文章和聊天记录已保存在本机。',
        );
      }
    },
  };
}
```

- [ ] **Step 2: Ensure model errors display nicely**

Modify `apiErrorText` in `apps/mobile/src/lib/apiError.ts`:

```ts
if (err.code?.startsWith('MODEL_')) {
  return {
    message: err.message,
    hint: err.hint,
  };
}
```

Place this after `err` is constructed and before connectivity handling.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck -w @shiren/mobile
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/lib/localModelClient.ts apps/mobile/src/lib/apiError.ts
git commit -m "feat(mobile): add direct DeepSeek model client"
```

---

## Task 9: Local API AI Methods for Chat and Writing

**Files:**
- Modify: `apps/mobile/src/lib/localApi.ts`
- Modify: `apps/mobile/src/lib/api.ts`

- [ ] **Step 1: Add chat send to local API**

Modify `localApi.ts` imports:

```ts
import {
  analyzeWritingIntentLocal,
  generateChatReply,
  generateRevisionSnapshotLocal,
} from '@shiren/engine';
import { createDeepSeekModelClient } from './localModelClient';
```

Add method:

```ts
sendChatMessage: async (
  sessionId: string,
  body: { content: string; images?: unknown[]; contextSelection?: unknown },
) => {
  const user = store().appendChatMessage(sessionId, {
    role: 'user',
    content: body.content,
  });
  const replyText = await generateChatReply(createDeepSeekModelClient(), {
    session: store().listChatSessions().find((s) => s.id === sessionId)!,
    history: store().getChatMessages(sessionId),
    userText: body.content,
  });
  const assistant = store().appendChatMessage(sessionId, {
    role: 'assistant',
    content: replyText,
  });
  deps.markChanged();
  return ok({
    userMessage: user,
    assistantMessage: assistant,
    contextUsage: { usedTokens: 0, maxTokens: 0, ratio: 0, blocks: [] },
  });
},
```

Adjust property names to exactly match existing `api.sendChatMessage` return type. Read `api.ts` around the current chat methods before applying this step.

- [ ] **Step 2: Add writing assistant intent**

Add local method:

```ts
analyzeWritingAssistantIntent: async (
  documentId: string,
  payload: {
    content: string;
    chapterTitle: string;
    chapterContent: string;
  },
) => {
  const result = await analyzeWritingIntentLocal(createDeepSeekModelClient(), payload);
  return ok({
    ...result,
    contextUsage: { usedTokens: 0, maxTokens: 0, ratio: 0, blocks: [] },
  });
},
```

- [ ] **Step 3: Add writing assistant confirm**

Add local method:

```ts
confirmWritingAssistant: async (
  documentId: string,
  body: {
    messageId: string;
    approved: boolean;
    blockId: string;
    chapterContent: string;
    chapterTitle: string;
    understandingScope: unknown;
  },
) => {
  if (!body.approved) {
    const assistant = store().appendWritingAssistantMessage(documentId, {
      role: 'assistant',
      content: '好的，您可以重新说说想怎么改。',
      kind: 'notice',
    });
    deps.markChanged();
    return ok({ assistant });
  }
  const pending = store()
    .getWritingAssistantMessages(documentId)
    .find((m) => m.id === body.messageId);
  const action = pending?.pendingAction ?? '润色';
  const instruction = pending?.pendingInstruction ?? pending?.content ?? '';
  const generated = await generateRevisionSnapshotLocal(createDeepSeekModelClient(), {
    action,
    instruction,
    chapterContent: body.chapterContent,
  });
  const revision = store().createRevision({
    documentId,
    blockId: body.blockId,
    snapshot: generated.newText,
    previousSnapshot: body.chapterContent,
    summary: generated.comment,
    source: 'ai',
    status: 'pending',
    suggestAction: action,
    suggestInstruction: instruction,
  });
  const assistant = store().appendWritingAssistantMessage(documentId, {
    role: 'assistant',
    content: generated.comment,
    kind: 'revision_ready',
    revisionId: revision.id,
    suggestAction: action,
  });
  deps.markChanged();
  return ok({
    assistant,
    revision,
    oldText: body.chapterContent,
    newText: generated.newText,
    comment: generated.comment,
  });
},
```

- [ ] **Step 4: Route API methods**

Modify `api.ts` to route:

```ts
sendChatMessage: (
  sessionId: string,
  body: Parameters<ReturnType<typeof local>['sendChatMessage']>[1],
) => local().sendChatMessage(sessionId, body),
analyzeWritingAssistantIntent: (
  documentId: string,
  payload: Parameters<ReturnType<typeof local>['analyzeWritingAssistantIntent']>[1],
) => local().analyzeWritingAssistantIntent(documentId, payload),
confirmWritingAssistant: (
  documentId: string,
  body: Parameters<ReturnType<typeof local>['confirmWritingAssistant']>[1],
) => local().confirmWritingAssistant(documentId, body),
```

Also route `getWritingAssistantContextUsage`, context preview, and chat context usage to local zero-usage placeholders if UI requires them:

```ts
const emptyContextUsage = { usedTokens: 0, maxTokens: 0, ratio: 0, blocks: [] };
```

- [ ] **Step 5: Typecheck and manual AI smoke**

Run:

```bash
npm run typecheck -w @shiren/mobile
```

Manual smoke:

1. Do not run `npm run dev:api`.
2. Open App.
3. Create or edit a local article.
4. Fill DeepSeek key in settings.
5. Ask one chat question.
6. Ask writing assistant to polish a chapter.
7. Verify messages/revision remain after App restart.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/localApi.ts apps/mobile/src/lib/api.ts
git commit -m "feat(mobile): run chat and writing AI locally"
```

---

## Task 10: Export and Import UI in Settings

**Files:**
- Modify: `apps/mobile/src/screens/MeScreen.tsx`
- Possibly create: `apps/mobile/src/components/LocalDataCard.tsx`

- [ ] **Step 1: Extract LocalDataCard**

Create `apps/mobile/src/components/LocalDataCard.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { appAlert } from '../lib/appAlert';
import {
  exportLocalDataPackage,
  getLocalDataStatus,
  parseImportFile,
  replaceLocalDataFromImport,
} from '../lib/localDataFiles';
import { useLocalStore } from '../context/LocalStoreContext';
import { colors, typography } from '../theme/colors';
import { zh } from '../locales/zh-CN';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
```

- [ ] **Step 2: Implement card component**

Append:

```tsx
export function LocalDataCard() {
  const { snapshot, replaceStore } = useLocalStore();
  const [bytes, setBytes] = useState(0);

  const refresh = useCallback(async () => {
    const status = await getLocalDataStatus();
    setBytes(status.bytes);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const exportData = async () => {
    try {
      const store = snapshot();
      if (!store) throw new Error('LOCAL_STORE_NOT_READY');
      await exportLocalDataPackage(store);
      appAlert('好了', zh.me.localDataExportDone);
      await refresh();
    } catch {
      appAlert('提示', zh.me.localDataExportFailed);
    }
  };

  const importData = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets[0]?.uri) return;
      appAlert(zh.me.localDataImportConfirmTitle, zh.me.localDataImportConfirmMessage, [
        { text: zh.writing.cancel, style: 'cancel' },
        {
          text: zh.common.confirm,
          onPress: () => {
            void (async () => {
              const store = await parseImportFile(picked.assets[0]!.uri);
              await replaceLocalDataFromImport(store);
              await replaceStore(store);
              appAlert('好了', zh.me.localDataImportDone);
              await refresh();
            })().catch(() => appAlert('提示', zh.me.localDataImportFailed));
          },
        },
      ]);
    } catch {
      appAlert('提示', zh.me.localDataImportFailed);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{zh.me.localDataTitle}</Text>
      <Text style={styles.body}>{zh.me.localDataMode}</Text>
      <Text style={styles.body}>{zh.me.localDataAiHint}</Text>
      <Text style={styles.meta}>本地数据大小：{formatBytes(bytes)}</Text>
      <View style={styles.actions}>
        <Pressable style={styles.button} onPress={() => void exportData()}>
          <Text style={styles.buttonText}>{zh.me.localDataExport}</Text>
        </Pressable>
        <Pressable style={styles.buttonSecondary} onPress={() => void importData()}>
          <Text style={styles.buttonSecondaryText}>{zh.me.localDataImport}</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

Append styles:

```tsx
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
    gap: 10,
  },
  title: { fontSize: typography.button, fontWeight: '700', color: colors.text },
  body: { fontSize: typography.caption, color: colors.textMuted, lineHeight: typography.bodyLineHeight },
  meta: { fontSize: typography.caption, color: colors.text, fontWeight: '600' },
  actions: { gap: 10 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  buttonText: { color: colors.onPrimary, fontWeight: '700' },
  buttonSecondary: {
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  buttonSecondaryText: { color: colors.primary, fontWeight: '700' },
});
```

- [ ] **Step 3: Add dependency**

Install document picker:

```bash
cd apps/mobile
npm install expo-document-picker
```

- [ ] **Step 4: Render in MeScreen**

Modify `apps/mobile/src/screens/MeScreen.tsx`:

```tsx
import { LocalDataCard } from '../components/LocalDataCard';
```

Place below title:

```tsx
<LocalDataCard />
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck -w @shiren/mobile
```

Expected: pass.

- [ ] **Step 6: Manual export/import QA**

1. Create a local article.
2. Export data package.
3. Confirm share sheet opens with `.shiren.json`.
4. Import the same package.
5. Confirm current documents remain visible.
6. Confirm API keys were not exported by inspecting JSON file.

- [ ] **Step 7: Commit**

```bash
git add package-lock.json apps/mobile/package.json apps/mobile/src/components/LocalDataCard.tsx apps/mobile/src/screens/MeScreen.tsx
git commit -m "feat(mobile): add local data export import"
```

---

## Task 11: Remove Server-Centric UI From Local Mode

**Files:**
- Modify: `apps/mobile/src/components/GlobalApiOfflineBanner.tsx`
- Modify: `apps/mobile/src/context/ApiConnectivityContext.tsx`
- Modify: `apps/mobile/src/navigation/RootTabs.tsx`
- Modify: `apps/mobile/src/screens/MeScreen.tsx`
- Modify: `apps/mobile/src/locales/zh-CN.ts`

- [ ] **Step 1: Stop rendering global server banner**

In `RootTabs.tsx`, remove `GlobalApiOfflineBanner` from `TabShell` for local-first mode:

```tsx
function TabShell({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1 }}>{children}</View>;
}
```

Keep the component files for future cloud mode, but do not show them by default.

- [ ] **Step 2: Remove server card from Settings**

In `MeScreen.tsx`, remove the “服务器连接” card added for self-hosted API mode. Replace it with `LocalDataCard` if not already present.

- [ ] **Step 3: Rename visible model network copy**

In `zh-CN.ts`, keep network strings only for model failures:

```ts
modelNetworkFailed: 'AI 模型暂时连不上，请检查网络后再试',
modelKeyMissing: '请先在设置里填写小助手密钥',
```

Do not show “连不上服务器” in local-first flows.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck -w @shiren/mobile
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/navigation/RootTabs.tsx apps/mobile/src/screens/MeScreen.tsx apps/mobile/src/locales/zh-CN.ts
git commit -m "refactor(mobile): remove server status from local mode"
```

---

## Task 12: Documentation Updates

**Files:**
- Create: `docs/local-first-data.md`
- Modify: `docs/AGENTS.md`
- Modify: `docs/项目介绍.md`
- Modify: `README.md`

- [ ] **Step 1: Create local-first user/maintainer doc**

Create `docs/local-first-data.md`:

```md
# 本地优先数据说明

诗人现在采用本地优先模式：

- 文章、历史版本、问问题记录、写作小助手记录存在手机本机。
- AI 改稿、问问题、云端识图、云端听写需要联网访问模型服务。
- App 不需要连接自建诗人 API 才能查看和编辑文章。

## 数据文件

主库：`shiren-store.json`

导出包：`诗人数据-YYYYMMDD-HHmm.shiren.json`

导出包不包含：

- DeepSeek 密钥
- ZenMux 密钥
- DashScope 密钥
- 字号和朗读设置

换设备后，需要重新填写密钥。

## 导出

设置 → 本地数据 → 导出数据包。

建议定期把导出的 `.shiren.json` 保存到微信文件、网盘、电脑或 U 盘。

## 导入

设置 → 本地数据 → 导入数据包。

导入会替换本机现有文章和聊天记录。导入前 App 会自动备份当前数据。

## 以后接后端

后端同步应以 `PersistedStore` / `.shiren.json` 为基础格式。第一版不做自动同步。
```

- [ ] **Step 2: Update AGENTS**

Modify `docs/AGENTS.md` principle 1 from server-source-of-truth to local-first:

```md
1. **数据本地优先**：文稿、版本、问问题记录、写作小助手记录默认存在手机本机，可导出 `.shiren.json` 数据包；AI 功能仍需要联网访问模型服务。
```

Add a note that `apps/api` is retained for future cloud/sync mode, not required for local-first use.

- [ ] **Step 3: Update family-facing intro**

Modify `docs/项目介绍.md` wherever it says content is stored on a family/cloud server:

```md
内容默认存在手机本机。你可以在「设置 → 本地数据」导出一份数据包，换手机时再导入。AI 改稿和问问题需要联网访问模型服务，但文章和聊天记录不经过自建服务器。
```

- [ ] **Step 4: Update README**

Modify README introduction:

```md
手机端（Expo）本地优先存储 + 可选模型服务；Node API 保留给未来云端/同步模式。
```

Keep API startup docs under a “legacy / future cloud mode” section.

- [ ] **Step 5: Commit**

```bash
git add docs/local-first-data.md docs/AGENTS.md docs/项目介绍.md README.md
git commit -m "docs: document local-first data mode"
```

---

## Task 13: Final Verification

**Files:**
- No new files expected.

- [ ] **Step 1: Run shared tests**

```bash
npm run test -w @shiren/shared
```

Expected: PASS.

- [ ] **Step 2: Run all typechecks**

```bash
npm run typecheck
```

Expected: all workspace typechecks pass.

- [ ] **Step 3: Verify app does not require API server**

Ensure no API server is running. Then run:

```bash
cd apps/mobile
npm run start
```

Manual expected:

- App opens.
- Writing tab shows local document or creates one.
- No global “连不上服务器” banner appears.
- Basic editing persists after reload.

- [ ] **Step 4: Verify AI boundary**

Manual expected:

- With no DeepSeek key, AI action says to configure the key.
- With DeepSeek key and network, chat reply works.
- With network disabled, article data remains visible and AI action says model network failed.

- [ ] **Step 5: Verify export/import**

Manual expected:

- Export share sheet opens with `.shiren.json`.
- Exported JSON contains `store` and no API key strings.
- Import replaces local data after confirmation.

- [ ] **Step 6: Final commit if needed**

If verification changes files:

```bash
git add packages/shared apps/mobile packages/engine docs README.md package-lock.json package.json
git commit -m "fix: finalize local-first data mode"
```

---

## Self-Review Notes

- Spec coverage:
  - Local-first boundary: Tasks 7, 8, 11, 12.
  - Local data package: Tasks 1, 3, 10.
  - Startup hydration: Task 4.
  - Local CRUD: Tasks 2, 5, 6.
  - Direct model access: Tasks 7, 8, 9.
  - Export/import no keys: Tasks 1, 10, 12.
  - Future backend path: Task 12 docs; engine separation in Task 7.
- Type consistency:
  - `PersistedStore` is shared from `@shiren/shared`.
  - `LocalStore` is pure and runtime-agnostic.
  - `LocalApi` returns existing `{ ok, data, requestId }` shapes.
- Known implementation caution:
  - Current `api.ts` has many method signatures. Before replacing each AI method, read its exact return shape and match UI expectations.
  - This plan intentionally starts with a minimal engine. Later work should improve prompt parity with the existing API.

