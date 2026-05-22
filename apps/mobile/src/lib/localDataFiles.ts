import * as FileSystem from 'expo-file-system/legacy';
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
const EXPORTS_DIR = `${ROOT}exports/`;
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

async function readJsonFile(path: string): Promise<unknown | null> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;
  const raw = await FileSystem.readAsStringAsync(path);
  return JSON.parse(raw);
}

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
      // best effort
    }
  }

  try {
    const backup = await readJsonFile(BACKUP_FILE);
    if (isPersistedStore(backup)) {
      await saveLocalPersistedStore(backup);
      return { store: backup, recoveredFromBackup: true, createdEmpty: false };
    }
  } catch {
    // fall through
  }

  const empty = createEmptyPersistedStore();
  await saveLocalPersistedStore(empty);
  return { store: empty, recoveredFromBackup: false, createdEmpty: true };
}

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
  const info = await FileSystem.getInfoAsync(STORE_FILE);
  if (!info.exists) {
    return { exists: false, bytes: 0, path: STORE_FILE };
  }
  let bytes = 0;
  try {
    const raw = await FileSystem.readAsStringAsync(STORE_FILE);
    bytes = new TextEncoder().encode(raw).length;
  } catch {
    bytes = 0;
  }
  return {
    exists: true,
    bytes,
    modifiedAt: info.modificationTime,
    path: STORE_FILE,
  };
}

async function ensureExportsDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(EXPORTS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(EXPORTS_DIR, { intermediates: true });
  }
}

/** 写入应用文档目录 exports/，可在本机保留多份备份 */
export async function saveLocalDataPackageToDevice(
  store: PersistedStore,
): Promise<{ path: string; fileName: string }> {
  await ensureExportsDir();
  const bundle = makeShirenExportBundle(store, {
    appVersion: Constants.expoConfig?.version ?? 'unknown',
  });
  const fileName = exportFileName();
  const exportPath = `${EXPORTS_DIR}${fileName}`;
  await FileSystem.writeAsStringAsync(exportPath, JSON.stringify(bundle, null, 2));
  return { path: exportPath, fileName };
}

/** 先保存到本机 exports/，再打开系统分享（可选存到「文件」、微信等） */
export async function exportLocalDataPackage(
  store: PersistedStore,
): Promise<{ path: string; fileName: string; shared: boolean }> {
  const saved = await saveLocalDataPackageToDevice(store);
  let shared = false;
  if (await Sharing.isAvailableAsync()) {
    try {
      await Sharing.shareAsync(saved.path, {
        mimeType: 'application/json',
        dialogTitle: '导出诗人数据',
        UTI: 'public.json',
      });
      shared = true;
    } catch {
      // 用户取消分享或分享失败时，本机文件仍保留
    }
  }
  return { ...saved, shared };
}

export async function parseImportFile(uri: string): Promise<PersistedStore> {
  const raw = await FileSystem.readAsStringAsync(uri);
  const parsed = JSON.parse(raw) as unknown;
  if (isShirenExportBundle(parsed)) return parsed.store;
  if (isPersistedStore(parsed)) return parsed;
  throw new Error('INVALID_SHIREN_DATA_PACKAGE');
}
