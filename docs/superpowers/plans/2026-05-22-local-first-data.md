# Local-First Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the app from “mobile client + self-hosted API stores data” to “mobile stores all user data locally, exports/imports one data package, and calls model vendors directly for AI.”

**Architecture:** Keep the existing UI-facing API shape, but replace HTTP persistence with a local `PersistedStore` backed by a JSON file on device. Extract shared, runtime-agnostic types and engine boundaries so `apps/mobile` and a future backend can share the same business logic instead of forking.

**Tech Stack:** TypeScript, Expo React Native, `expo-file-system`, `expo-sharing`, `expo-secure-store`, Node test runner (`node --test`) for pure modules, existing `@shiren/shared` types/prompts.

---

## Scope Check

This is a large architectural change. **Do not treat “Task 13 passes” as “local-first complete.”** Ship in three phases; each phase has a user-visible done definition.

Do not attempt automatic cloud sync, merge import, export encryption, or offline AI in this plan.

### Product boundary (unchanged from spec)

- **Local:** articles, revisions, chat, writing-assistant messages — on device, exportable as `.shiren.json` (no API keys in bundle).
- **Network:** AI chat/writing, OCR/ASR/TTS when using vendor keys — direct to model vendors, **not** through 诗人 API.
- **Legacy:** `apps/api` + `docs/deploy-aliyun.md` remain for optional future cloud/sync; **default mobile build is local-first** (no `EXPO_PUBLIC_API_URL` required).

### Three implementation phases

| Phase | Tasks | Done when (user-visible) |
|-------|-------|---------------------------|
| **1 — Local data** | 1, 2, 3, 4, 5, 6, 10 | App opens **without** `dev:api`; create/edit/save/restart keeps articles; export/import works |
| **2 — Local AI + vendors** | 7, 8, 9a–9d | DeepSeek key + network → chat + writing assistant main path; keys verify locally; ASR/TTS/OCR wired |
| **3 — Parity or honest downgrade** | 9e, 11, 12, 13 | Context ring/compact either real (`contextPipeline`) **or** hidden with copy; docs aligned; full manual matrix green |

**Checkpoint:** Do **not** stop after Task 5 with AI methods still on HTTP — that is a broken half-state. Either finish Phase 1 (data only, AI buttons show “configure key / coming in phase 2”) or continue through Task 9.

### API method coverage matrix

Before routing each method in `api.ts`, mark it in this table (update as you implement):

| `api` method | Phase | Implementation | Notes |
|--------------|-------|----------------|-------|
| `health` | 1 | `localApi` | `{ service: '诗人-local' }` |
| `listDocuments` / `createDocument` / `getDocument` / `updateDocument` / `addChapter` | 1 | `localApi` → `LocalStore` | Filter `hiddenAt` in UI (`documentVisibility.ts`) |
| `listRevisions` / `getRevision` / `acceptRevision` / `rejectRevision` | 1 | `localApi` | Match `db.ts` semantics (`acceptRevision` by `revisionId`) |
| `rollback` | 1 | `localApi` | Mirror `documents.ts` POST rollback → `createRevision` with `source: 'rollback'` |
| `getWritingAssistantMessages` | 1 | `localApi` | + `ensureWritingAssistantWelcome` on first open |
| `listChatSessions` / `createChatSession` / `getChatMessages` | 1 | `localApi` | |
| `getDeepSeekStatus` / `verifyDeepSeekKey` | 2 | SecureStore + `localModelClient` | No `/api/settings/*` |
| `getZenMuxStatus` / `verifyZenMuxKey` | 2 | SecureStore + vendor verify | |
| `getDashScopeStatus` / `verifyDashScopeKey` | 2 | SecureStore + vendor verify | |
| `analyzeChatIntent` | 2 | `engine` + `localApi` | Must persist intent/confirm messages like server |
| `sendChatMessage` | 2 | `engine` + `localApi` | Return shape: `user`, `assistant`, `contextUsage` (read `api.ts`) |
| `compactChatSession` | 2/3 | `engine` or stub + UI hide | Used by `ChatScreen` |
| `getChatContextUsage` / `getChatContextPreview` | 2/3 | `engine` or stub + UI hide | `ContextComposerModal` |
| `analyzeWritingAssistantIntent` | 2 | `engine` + `localApi` | Full payload (excerpts, `contextSelection`, …) |
| `sendWritingAssistantMessage` | 2 | `engine` + `localApi` | **Required** — `WritingAssistantPanel` |
| `confirmWritingAssistant` | 2 | `engine` + `localApi` | |
| `getWritingAssistantContextUsage` / `getWritingContextPreview` | 2/3 | `engine` or stub + UI hide | |
| `aiSuggest` | 2 | `engine` + `localApi` | `DiffPreviewScreen` retry |
| `ocrImage` | 2 | On-device OCR first; optional ZenMux direct | `recognizeImage.ts` |
| `transcribeAudio` | 2 | DashScope direct from mobile | `cloudSpeech.ts` |
| `synthesizeSpeech` | 2 | DashScope direct from mobile | `qwenTtsPlayer.ts` |

**Engine MVP disclaimer (Phase 2):** first `@shiren/engine` version may **not** match server `contextPipeline` / `assistantGuideRegistry` / full intent JSON schemas. Document gaps in `docs/local-first-data.md` under “与云端版差异”. Phase 3 (Task 9e) closes or hides each gap.

---

## File Structure

### Shared

- Create `packages/shared/src/persistedStore.ts`  
  Defines `PersistedStore`, `ShirenExportBundle`, constants, empty-store factory, validation helpers.
- Modify `packages/shared/src/index.ts`  
  Exports persisted-store types/helpers.
- Create `packages/shared/src/store/createLocalStore.ts`  
  **Migrated from** `apps/api/src/store/db.ts` (factory over `PersistedStore`, no module globals, no `persist()` inside). Do **not** rewrite a simplified store from scratch.
- Create `packages/shared/src/store/createLocalStore.test.ts`  
  Port critical behaviors: `emptyChapter(0, …)`, pending supersede, `acceptRevision` summary, `listRevisions` excludes rejected, welcome message, rollback revision.
- Modify `apps/api/src/store/db.ts` (optional thin re-export)  
  API server can delegate to `@shiren/shared` store later; not blocking mobile Phase 1.
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

function isValidDocument(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    Array.isArray(value.chapters) &&
    value.chapters.every(
      (ch) =>
        isObject(ch) &&
        typeof ch.id === 'string' &&
        Array.isArray(ch.blocks) &&
        ch.blocks.every(
          (b) => isObject(b) && typeof b.id === 'string' && typeof b.content === 'string',
        ),
    )
  );
}

export function isPersistedStore(value: unknown): value is PersistedStore {
  if (!isObject(value)) return false;
  if (
    !Array.isArray(value.documents) ||
    !Array.isArray(value.revisions) ||
    !Array.isArray(value.chatSessions) ||
    !isRecordOfArrays(value.chatMessages) ||
    !isRecordOfArrays(value.writingAssistantMessages)
  ) {
    return false;
  }
  return value.documents.every(isValidDocument);
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

## Task 2: Migrate LocalStore from `apps/api/src/store/db.ts`

**Goal:** One source of truth for data mutations. **Copy and refactor** `db.ts` into a pure `createLocalStore(initial, deps)` — do **not** use the simplified inline store from older drafts of this plan.

**Files:**
- Create: `packages/shared/src/store/createLocalStore.ts`
- Create: `packages/shared/src/store/createLocalStore.test.ts`
- Modify: `packages/shared/src/index.ts`
- Reference: `apps/api/src/store/db.ts`, `apps/api/src/routes/documents.ts` (rollback)

**Must port from `db.ts` (minimum):**

| Source export | Notes |
|---------------|-------|
| `createDocument` | `emptyChapter(0, formatChapterTitle(0))`, `hiddenAt: null` |
| `listDocuments` / `getDocument` / `updateDocument` | |
| `saveDocumentContent` | Block content save path |
| `addChapter` | `MAX_CHAPTERS`, `emptyChapter(nextIndex, …)` |
| `createRevision` | `supersedePendingRevisionsForBlock`, `applyRevisionToDocument` |
| `acceptRevision` / `rejectRevision` | `acceptRevision(revisionId)` — wrapper may add `documentId` for API shape |
| `listRevisions` / `getRevision` | Excludes `rejected` |
| `createChatSession` / `listChatSessions` / `getChatMessages` / `addChatMessage` | `lastQuestion` on list |
| `updateChatSessionContext` / `updateChatSessionTitle` | For compact/title |
| `updateDocumentContextFields` | Writing context summary fields |
| `getWritingAssistantMessages` / `addWritingAssistantMessage` / `updateWritingAssistantMessage` / `getWritingAssistantMessage` | |
| `ensureWritingAssistantWelcome` | |
| `findBlock` | Used by revision apply |
| *(new on LocalStore)* `rollback(documentId, revisionId)` | Same as API route: new revision with `source: 'rollback'`, snapshot from target rev |

**Factory shape:**

```ts
export function createLocalStore(
  initial: PersistedStore,
  deps?: { now?: () => string; uuid?: () => string },
): LocalStore {
  // internal Maps or arrays — NO savePersistedStore() inside
  return {
    snapshot(): PersistedStore { /* clone full store */ },
    replace(next: PersistedStore): void { /* replace in-memory */ },
    // …all methods above
  };
}
```

Mobile `LocalStoreProvider` calls `saveLocalPersistedStore(store.snapshot())` after `markChanged` — persistence stays outside shared package.

- [ ] **Step 1: Write failing LocalStore tests**

Create `packages/shared/src/store/createLocalStore.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmptyPersistedStore,
  createLocalStore,
} from '../index.js';

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
    snapshot: 'a',
    previousSnapshot: '',
    summary: '1',
    source: 'ai',
    status: 'pending',
  });
  const r2 = store.createRevision({
    documentId: doc.id,
    blockId,
    snapshot: 'b',
    previousSnapshot: '',
    summary: '2',
    source: 'ai',
    status: 'pending',
  });
  assert.equal(store.getRevision(r1.id)?.status, 'rejected');
  assert.equal(store.getRevision(r2.id)?.status, 'pending');
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
      let n = 0;
      return () => `id-${++n}`;
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
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test -w @shiren/shared
```

Expected: fails because `createLocalStore` does not exist.

- [ ] **Step 3: Implement by migrating `db.ts`**

1. Copy `apps/api/src/store/db.ts` into `packages/shared/src/store/createLocalStore.ts`.
2. Replace module-level `Map`s + `persist()` with `let data: PersistedStore` + `snapshot()` / `replace()`.
3. Inject `now` / `uuid` via `deps` (default `new Date().toISOString()` / `crypto.randomUUID()`).
4. Add `rollback(documentId, revisionId)` using the same logic as `documentsRouter.post('/:id/rollback')`.
5. Keep `timezone: 'Asia/Shanghai'` on revisions as in `db.ts`.
6. Export `LocalStore` as `ReturnType<typeof createLocalStore>`.

**Do not** add AI, HTTP, or file I/O in this module.

- [ ] **Step 3b: Align `localApi` wrappers with store signatures**

`localApi.acceptRevision(documentId, revisionId, edited?)` should call `store.acceptRevision(revisionId)` and then `store.getDocument(documentId)` for the return shape UI expects.

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
git commit -m "feat(shared): migrate local store from api db.ts"
```

---

## Task 3: Mobile File Persistence for Local Data

**Files:**
- Create: `apps/mobile/src/lib/localDataFiles.ts`
- Modify: `apps/mobile/src/locales/zh-CN.ts`
- Modify: `apps/mobile/package.json` (add `expo-document-picker` early — needed by Task 10)

- [ ] **Step 0: Add import dependency**

```bash
cd apps/mobile && npx expo install expo-document-picker
```

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

/** Prefer `LocalStoreContext.replaceStore` — it updates in-memory + disk in one step. */
export async function replaceLocalDataFromImport(store: PersistedStore): Promise<void> {
  await saveLocalPersistedStore(store);
}
```

`replaceStore` in `LocalStoreContext` should: (1) backup current `snapshot()` to `.bak` if non-empty, (2) `createLocalStore(next)`, (3) `saveLocalPersistedStore(next)`. Import UI calls **only** `replaceStore` — do not also call `replaceLocalDataFromImport` (avoids double write).

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
  /** Live store instance — held in React state so consumers re-render on generation */
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
  const [store, setStore] = useState<LocalStore | null>(null);
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

  const replaceStore = useCallback(async (next: PersistedStore) => {
    const instance = createLocalStore(next);
    storeRef.current = instance;
    setStore(instance);
    await saveLocalPersistedStore(next);
    setGeneration((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadLocalPersistedStore();
      if (cancelled) return;
      const instance = createLocalStore(result.store);
      storeRef.current = instance;
      setStore(instance);
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
      store,
      ready,
      generation,
      snapshot: () => storeRef.current?.snapshot() ?? null,
      persistNow,
      replaceStore,
      markChanged,
    }),
    [store, ready, generation, persistNow, replaceStore, markChanged],
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

**Phase:** 1 — **Checkpoint:** after this task, non-AI flows must work with API server **stopped**. AI methods may still HTTP until Task 9; if shipping a build here, disable or gate AI buttons with `modelKeyMissing` copy.

**Files:**
- Create: `apps/mobile/src/lib/localApi.ts`
- Modify: `apps/mobile/src/lib/api.ts`
- Modify: screens only if method return shapes differ

Update the **API coverage matrix** (Scope Check) for every method routed in this task.

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
      store().acceptRevision(revisionId, editedSnapshot);
      deps.markChanged();
      return ok(store().getDocument(documentId));
    },
    rejectRevision: async (documentId: string, revisionId: string) => {
      const rev = store().rejectRevision(revisionId);
      deps.markChanged();
      return ok(rev);
    },
    rollback: async (documentId: string, revisionId: string) => {
      const rev = store().rollback(documentId, revisionId);
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
rollback: (documentId: string, revisionId: string) =>
  local().rollback(documentId, revisionId),
```

Leave AI/chat/assistant/vendor methods on HTTP **only until Task 9** — do not ship Phase 1 to family testers without either finishing Task 9 or gating AI entry points.

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

**Note:** Method names follow migrated `db.ts`: `addChatMessage`, `addWritingAssistantMessage`, `updateWritingAssistantMessage` — not `append*`.

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

Expected: writing assistant helpers missing if Step 3 of Task 2 skipped them.

- [ ] **Step 3: Confirm Task 2 already exported**

`getWritingAssistantMessages`, `addWritingAssistantMessage`, `updateWritingAssistantMessage`, `ensureWritingAssistantWelcome` must exist on `LocalStore` from the `db.ts` migration. If not, add them in Task 2 — do not duplicate divergent implementations here.

- [ ] **Step 4: Add local API methods**

Modify `apps/mobile/src/lib/localApi.ts`:

```ts
getWritingAssistantMessages: async (documentId: string) =>
  ok(store().getWritingAssistantMessages(documentId)),
```

Add chat methods:

```ts
listChatSessions: async () => ok(store().listChatSessions()),
createChatSession: async (title?: string) => {
  const session = store().createChatSession(title?.trim() || '新话题');
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

## Task 9: Local API — AI, Vendors, and Context (split)

**Phase:** 2 (required for family use) + Phase 3 (context parity or UI downgrade).

**Files:**
- Modify: `apps/mobile/src/lib/localApi.ts`
- Modify: `apps/mobile/src/lib/api.ts`
- Modify: `apps/mobile/src/lib/cloudSpeech.ts`, `apps/mobile/src/lib/qwenTtsPlayer.ts`, `apps/mobile/src/lib/recognizeImage.ts` (vendor direct)
- Modify: `packages/engine/src/*` as needed

**Before coding:** read each method’s return type in `api.ts` and the caller in mobile (grep `api.<method>`). Update the coverage matrix as each sub-task lands.

---

### Task 9a — Chat intent + send

- [ ] **Step 1: Add `analyzeChatIntent` to localApi**

Persist intent analysis as assistant messages (kinds / pending fields) matching server behavior enough for `ChatScreen` confirm UI. Use `@shiren/engine` (can start minimal JSON intent; document parity gap).

- [ ] **Step 2: Add `sendChatMessage`**

Return shape must match `api.ts` exactly — typically `{ user, assistant, session?, contextUsage }`, **not** `userMessage` / `assistantMessage`. After model reply, `addChatMessage` for both roles; `markChanged`.

- [ ] **Step 3: Route in `api.ts`**

```ts
analyzeChatIntent: (sessionId, body) => local().analyzeChatIntent(sessionId, body),
sendChatMessage: (sessionId, body) => local().sendChatMessage(sessionId, body),
```

- [ ] **Step 4: Commit** — `feat(mobile): local chat intent and send`

---

### Task 9b — Writing assistant full path

- [ ] **Step 1: `analyzeWritingAssistantIntent`** — full payload (excerpts, `contextSelection`, `directChat`, …); persist intent bubble via `updateWritingAssistantMessage` / `addWritingAssistantMessage`.

- [ ] **Step 2: `sendWritingAssistantMessage`** — required by `WritingAssistantPanel.tsx`; not optional.

- [ ] **Step 3: `confirmWritingAssistant`** — approved / rejected branches; `createRevision` on approve.

- [ ] **Step 4: `aiSuggest`** — `DiffPreviewScreen` retry path; engine generates new pending revision.

- [ ] **Step 5: Route all four in `api.ts`**

- [ ] **Step 6: Manual smoke** — intent → confirm → revision ready → accept; reject and re-ask.

- [ ] **Step 7: Commit** — `feat(mobile): local writing assistant flows`

---

### Task 9c — Settings keys (no poet API)

- [ ] **Step 1: `getDeepSeekStatus` / `verifyDeepSeekKey`** — read SecureStore; verify via `localModelClient` ping.

- [ ] **Step 2: Same pattern for ZenMux and DashScope**

- [ ] **Step 3: Route in `api.ts`; remove dependency on `/api/settings/*`**

- [ ] **Step 4: Commit** — `feat(mobile): verify model keys locally`

---

### Task 9d — Media vendors (direct from mobile)

- [ ] **Step 1: `transcribeAudio`** — implement in `cloudSpeech.ts` using DashScope HTTP + SecureStore key (extract shared fetch helper if needed).

- [ ] **Step 2: `synthesizeSpeech`** — `qwenTtsPlayer.ts` direct DashScope.

- [ ] **Step 3: `ocrImage`** — prefer existing on-device path in `ocrRecognize.ts`; only call ZenMux direct when configured.

- [ ] **Step 4: Route in `api.ts`**

- [ ] **Step 5: Commit** — `feat(mobile): direct vendor ASR TTS OCR`

---

### Task 9e — Context usage / compact (Phase 3)

Choose **one** approach (document in `docs/local-first-data.md`):

**A — Real:** port `contextPipeline` from `apps/api` into `@shiren/engine`; wire `getChatContextUsage`, `getChatContextPreview`, `compactChatSession`, writing context usage/preview.

**B — Degrade:** hide `HeaderContextMeter`, context composer, and compact button in local mode; stub methods return empty usage only if something still calls them.

- [ ] **Step 1: Implement A or B**

- [ ] **Step 2: Commit** — `feat(mobile): context metering for local mode` or `refactor(mobile): hide context UI in local mode`

---

### Task 9 — Final integration (after 9a–9d)

- [ ] **Step 1:** Grep `apps/mobile` for `api.` — every hit must be local, vendor-direct, or intentionally stubbed; **zero** calls to `API_BASE_URL` for product flows.

- [ ] **Step 2:** `npm run typecheck` (root) + Phase 2 manual smoke (see Task 13).

- [ ] **Step 3:** Commit any remaining routing — `feat(mobile): complete local-first api surface`

**Reference:** `sendChatMessage` must return `{ user, assistant, session?, contextUsage }` per `api.ts` — not `userMessage` / `assistantMessage`. Use `store().addChatMessage` (migrated name from `db.ts`), not a nonexistent `appendChatMessage`.

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

**Align with:** uncommitted / in-progress `ApiConnectivityContext`, `GlobalApiOfflineBanner`, `deploy-aliyun.md`. Local-first is default; cloud API URL is **legacy optional** (document under README “future cloud mode”), not the family install path.

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

- [ ] **Step 1: Automated**

```bash
npm run test -w @shiren/shared
npm run typecheck
```

Expected: PASS.

- [ ] **Step 2: Phase 1 — no API server**

Stop `dev:api`. Run `cd apps/mobile && npm run start`.

| # | Case | Expected |
|---|------|----------|
| 1 | Cold start | App opens; no global “连不上服务器” |
| 2 | Create / edit article | Saves; survives force-quit + reopen |
| 3 | Add chapter, rename title | Persists |
| 4 | Accept / reject revision | Block content and history correct |
| 5 | Rollback from history | New rollback revision; content restored |
| 6 | Hide / restore document | `hiddenAt` respected in library |
| 7 | Chat session + messages | Local list/messages persist |
| 8 | Writing assistant thread | Messages persist; welcome on empty doc |
| 9 | Export | `.shiren.json`; no key fields in JSON |
| 10 | Import | Confirms; backs up; replaces data; keys still empty in bundle |

- [ ] **Step 3: Phase 2 — AI and vendors (network on)**

| # | Case | Expected |
|---|------|----------|
| 11 | No DeepSeek key | Chat/writing show configure-key copy |
| 12 | Chat: intent → confirm → send | Full bubble flow works |
| 13 | Chat: guide path | Works or documented as Phase 3 gap |
| 14 | Writing: intent → confirm → revision | Diff preview reachable |
| 15 | Diff “再改一版” | New pending revision without API |
| 16 | Verify keys in settings | No call to poet `/api/settings` |
| 17 | Voice input (ASR) | Transcribes with DashScope key |
| 18 | TTS play | Synthesizes with DashScope key |
| 19 | Photo OCR | On-device or ZenMux path works |
| 20 | Airplane mode | Articles visible; AI shows model network error |

- [ ] **Step 4: Phase 3 — context (if 9e chose B, verify UI hidden)**

| # | Case | Expected |
|---|------|----------|
| 21 | Context ring / compact | Real metrics **or** controls hidden + copy in settings |
| 22 | Context composer preview | Works **or** hidden |

- [ ] **Step 5: Coverage matrix audit**

Every row in Scope Check API matrix marked implemented or explicitly deferred with doc link.

- [ ] **Step 6: Final commit if needed**

If verification changes files:

```bash
git add packages/shared apps/mobile packages/engine docs README.md package-lock.json package.json
git commit -m "fix: finalize local-first data mode"
```

---

## Self-Review Notes

- **Phases:** 1 = Tasks 1–6, 10; 2 = 7–8, 9a–9d; 3 = 9e, 11–13.
- **Spec coverage:**
  - Local-first boundary: Tasks 7, 8, 9a–9d, 11, 12.
  - Local data package: Tasks 1, 3, 10.
  - Startup hydration: Task 4 (`store` in React state, not ref-only context).
  - Local CRUD: Tasks 2 (migrate `db.ts`), 5, 6.
  - Direct model access: Tasks 7, 8, 9a–9d.
  - Export/import no keys: Tasks 1, 10, 12.
  - Future backend: Task 12; optional `apps/api` / `deploy-aliyun.md` not default.
- **Deliberate MVP gaps (document in `docs/local-first-data.md`):**
  - `@shiren/engine` v1 may lack `contextPipeline`, `assistantGuideRegistry`, server-grade intent JSON.
  - Task 9e must either port context or hide UI — never leave a stuck-at-zero context ring without explanation.
- **Do not:**
  - Rewrite a simplified `createLocalStore` from scratch.
  - Stop after Task 5 for family testers without AI gating or Task 9.
  - Double-save on import (`replaceStore` only).
- **Execution:** Use superpowers:subagent-driven-development per phase, or executing-plans for full run; update API matrix as you go.

