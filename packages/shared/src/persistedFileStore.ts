import {
  createEmptyPersistedStore,
  isPersistedStore,
  type PersistedStore,
} from './persistedStore.js';

export type PersistedStoreFilePaths = {
  main: string;
  backup: string;
  temporary: string;
  broken: string;
};

export type PersistedFileOperations = {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, value: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
};

export type PersistedStoreFileLoadResult = {
  store: PersistedStore;
  recoveredFromBackup: boolean;
  createdEmpty: boolean;
};

type StoreCandidate = {
  exists: boolean;
  raw?: string;
  store?: PersistedStore;
};

async function readCandidate(
  operations: PersistedFileOperations,
  path: string,
): Promise<StoreCandidate> {
  if (!(await operations.exists(path))) return { exists: false };
  const raw = await operations.read(path);
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPersistedStore(parsed)
      ? { exists: true, raw, store: parsed }
      : { exists: true, raw };
  } catch {
    return { exists: true, raw };
  }
}

async function writeVerifiedStore(
  operations: PersistedFileOperations,
  paths: PersistedStoreFilePaths,
  store: PersistedStore,
  options: { backUpMain: boolean; serialized?: string },
): Promise<void> {
  if (options.backUpMain) {
    const main = await readCandidate(operations, paths.main);
    if (main.store) {
      await operations.copy(paths.main, paths.backup);
    }
  }

  const serialized = options.serialized ?? JSON.stringify(store, null, 2);
  await operations.write(paths.temporary, serialized);
  const verifyRaw = await operations.read(paths.temporary);
  const parsed: unknown = JSON.parse(verifyRaw);
  if (!isPersistedStore(parsed)) throw new Error('LOCAL_STORE_VERIFY_FAILED');

  await operations.write(paths.main, verifyRaw);
  await operations.remove(paths.temporary);
}

export async function savePersistedStoreFiles(
  operations: PersistedFileOperations,
  paths: PersistedStoreFilePaths,
  store: PersistedStore,
): Promise<void> {
  await writeVerifiedStore(operations, paths, store, { backUpMain: true });
}

export async function loadPersistedStoreFiles(
  operations: PersistedFileOperations,
  paths: PersistedStoreFilePaths,
): Promise<PersistedStoreFileLoadResult> {
  let main: StoreCandidate | undefined;
  let mainReadError: unknown;
  try {
    main = await readCandidate(operations, paths.main);
  } catch (error) {
    mainReadError = error;
  }

  if (main?.store) {
    return { store: main.store, recoveredFromBackup: false, createdEmpty: false };
  }

  if (main?.exists) {
    try {
      await operations.copy(paths.main, paths.broken);
    } catch {
      // 损坏样本仅用于排障，复制失败不阻断备份恢复。
    }
  }

  let backup: StoreCandidate;
  try {
    backup = await readCandidate(operations, paths.backup);
  } catch (error) {
    throw mainReadError ?? error;
  }
  if (backup.store && backup.raw) {
    await writeVerifiedStore(operations, paths, backup.store, {
      backUpMain: false,
      serialized: backup.raw,
    });
    return { store: backup.store, recoveredFromBackup: true, createdEmpty: false };
  }

  if (mainReadError) throw mainReadError;

  const empty = createEmptyPersistedStore();
  await writeVerifiedStore(operations, paths, empty, { backUpMain: false });
  return { store: empty, recoveredFromBackup: false, createdEmpty: true };
}
