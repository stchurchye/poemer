import { createEmptyPersistedStore, isPersistedStore, } from './persistedStore.js';
async function readCandidate(operations, path) {
    if (!(await operations.exists(path)))
        return { exists: false };
    const raw = await operations.read(path);
    try {
        const parsed = JSON.parse(raw);
        return isPersistedStore(parsed)
            ? { exists: true, raw, store: parsed }
            : { exists: true, raw };
    }
    catch {
        return { exists: true, raw };
    }
}
async function writeVerifiedStore(operations, paths, store, options) {
    if (options.backUpMain) {
        const main = await readCandidate(operations, paths.main);
        if (main.store) {
            await operations.copy(paths.main, paths.backup);
        }
    }
    const serialized = options.serialized ?? JSON.stringify(store, null, 2);
    await operations.write(paths.temporary, serialized);
    const verifyRaw = await operations.read(paths.temporary);
    const parsed = JSON.parse(verifyRaw);
    if (!isPersistedStore(parsed))
        throw new Error('LOCAL_STORE_VERIFY_FAILED');
    await operations.write(paths.main, verifyRaw);
    await operations.remove(paths.temporary);
}
export async function savePersistedStoreFiles(operations, paths, store) {
    await writeVerifiedStore(operations, paths, store, { backUpMain: true });
}
export async function loadPersistedStoreFiles(operations, paths) {
    let main;
    let mainReadError;
    try {
        main = await readCandidate(operations, paths.main);
    }
    catch (error) {
        mainReadError = error;
    }
    if (main?.store) {
        return { store: main.store, recoveredFromBackup: false, createdEmpty: false };
    }
    if (main?.exists) {
        try {
            await operations.copy(paths.main, paths.broken);
        }
        catch {
            // 损坏样本仅用于排障，复制失败不阻断备份恢复。
        }
    }
    let backup;
    try {
        backup = await readCandidate(operations, paths.backup);
    }
    catch (error) {
        throw mainReadError ?? error;
    }
    if (backup.store && backup.raw) {
        await writeVerifiedStore(operations, paths, backup.store, {
            backUpMain: false,
            serialized: backup.raw,
        });
        return { store: backup.store, recoveredFromBackup: true, createdEmpty: false };
    }
    if (mainReadError)
        throw mainReadError;
    const empty = createEmptyPersistedStore();
    await writeVerifiedStore(operations, paths, empty, { backUpMain: false });
    return { store: empty, recoveredFromBackup: false, createdEmpty: true };
}
//# sourceMappingURL=persistedFileStore.js.map