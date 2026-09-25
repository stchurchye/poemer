import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyPersistedStore } from './persistedStore.js';
import { loadPersistedStoreFiles, savePersistedStoreFiles, } from './persistedFileStore.js';
function memoryOperations(initial) {
    const files = new Map(initial);
    const copies = [];
    const operations = {
        async exists(path) {
            return files.has(path);
        },
        async read(path) {
            const value = files.get(path);
            if (value === undefined)
                throw new Error('ENOENT');
            return value;
        },
        async write(path, value) {
            files.set(path, value);
        },
        async copy(from, to) {
            copies.push({ from, to });
            const value = files.get(from);
            if (value === undefined)
                throw new Error('ENOENT');
            files.set(to, value);
        },
        async remove(path) {
            files.delete(path);
        },
    };
    return { files, copies, operations };
}
test('backup recovery never overwrites the valid backup with a broken main file', async () => {
    const paths = {
        main: 'main.json',
        backup: 'backup.json',
        temporary: 'temporary.json',
        broken: 'broken.json',
    };
    const validBackup = JSON.stringify(createEmptyPersistedStore());
    const { files, copies, operations } = memoryOperations([
        [paths.main, '{broken json'],
        [paths.backup, validBackup],
    ]);
    const result = await loadPersistedStoreFiles(operations, paths);
    assert.equal(result.recoveredFromBackup, true);
    assert.equal(files.get(paths.main), validBackup);
    assert.equal(files.get(paths.backup), validBackup);
    assert.ok(copies.some((copy) => copy.from === paths.main && copy.to === paths.broken));
    assert.ok(!copies.some((copy) => copy.from === paths.main && copy.to === paths.backup), '损坏主文件绝不能覆盖最后一份有效备份');
});
test('normal save rotates the previous valid main file into backup', async () => {
    const paths = {
        main: 'main.json',
        backup: 'backup.json',
        temporary: 'temporary.json',
        broken: 'broken.json',
    };
    const previous = createEmptyPersistedStore();
    const next = { ...createEmptyPersistedStore(), chatMessages: { topic: [] } };
    const previousRaw = JSON.stringify(previous);
    const { files, operations } = memoryOperations([[paths.main, previousRaw]]);
    await savePersistedStoreFiles(operations, paths, next);
    assert.equal(files.get(paths.backup), previousRaw);
    assert.deepEqual(JSON.parse(files.get(paths.main) ?? ''), next);
});
test('failed recovery write leaves the valid backup untouched and reports failure', async () => {
    const paths = {
        main: 'main.json',
        backup: 'backup.json',
        temporary: 'temporary.json',
        broken: 'broken.json',
    };
    const validBackup = JSON.stringify(createEmptyPersistedStore());
    const fixture = memoryOperations([
        [paths.main, '{broken json'],
        [paths.backup, validBackup],
    ]);
    const write = fixture.operations.write;
    fixture.operations.write = async (path, value) => {
        if (path === paths.main)
            throw new Error('disk unavailable');
        await write(path, value);
    };
    await assert.rejects(loadPersistedStoreFiles(fixture.operations, paths), /disk unavailable/);
    assert.equal(fixture.files.get(paths.backup), validBackup);
});
test('main read failure falls back to a valid backup', async () => {
    const paths = {
        main: 'main.json',
        backup: 'backup.json',
        temporary: 'temporary.json',
        broken: 'broken.json',
    };
    const validBackup = JSON.stringify(createEmptyPersistedStore());
    const fixture = memoryOperations([
        [paths.main, 'unreadable'],
        [paths.backup, validBackup],
    ]);
    const read = fixture.operations.read;
    fixture.operations.read = async (path) => {
        if (path === paths.main)
            throw new Error('EIO');
        return read(path);
    };
    const result = await loadPersistedStoreFiles(fixture.operations, paths);
    assert.equal(result.recoveredFromBackup, true);
    assert.equal(fixture.files.get(paths.main), validBackup);
    assert.equal(fixture.files.get(paths.backup), validBackup);
});
test('main read failure without a readable backup never replaces valid data with an empty store', async () => {
    const paths = {
        main: 'main.json',
        backup: 'backup.json',
        temporary: 'temporary.json',
        broken: 'broken.json',
    };
    const validMain = JSON.stringify({
        ...createEmptyPersistedStore(),
        chatMessages: { important: [] },
    });
    const fixture = memoryOperations([[paths.main, validMain]]);
    const read = fixture.operations.read;
    fixture.operations.read = async (path) => {
        if (path === paths.main)
            throw new Error('EIO');
        return read(path);
    };
    await assert.rejects(loadPersistedStoreFiles(fixture.operations, paths), /EIO/);
    assert.equal(fixture.files.get(paths.main), validMain);
    assert.equal(fixture.files.has(paths.temporary), false);
});
test('temporary read failures for both main and backup never create an empty store', async () => {
    const paths = {
        main: 'main.json',
        backup: 'backup.json',
        temporary: 'temporary.json',
        broken: 'broken.json',
    };
    const validMain = JSON.stringify(createEmptyPersistedStore());
    const validBackup = JSON.stringify({
        ...createEmptyPersistedStore(),
        chatMessages: { backup: [] },
    });
    const fixture = memoryOperations([
        [paths.main, validMain],
        [paths.backup, validBackup],
    ]);
    fixture.operations.read = async (path) => {
        if (path === paths.main || path === paths.backup)
            throw new Error(`EIO:${path}`);
        const value = fixture.files.get(path);
        if (value === undefined)
            throw new Error('ENOENT');
        return value;
    };
    await assert.rejects(loadPersistedStoreFiles(fixture.operations, paths), /EIO/);
    assert.equal(fixture.files.get(paths.main), validMain);
    assert.equal(fixture.files.get(paths.backup), validBackup);
    assert.equal(fixture.files.has(paths.temporary), false);
});
test('normal save never rotates an invalid main over a valid backup', async () => {
    const paths = {
        main: 'main.json',
        backup: 'backup.json',
        temporary: 'temporary.json',
        broken: 'broken.json',
    };
    const validBackup = JSON.stringify(createEmptyPersistedStore());
    const fixture = memoryOperations([
        [paths.main, '{broken json'],
        [paths.backup, validBackup],
    ]);
    const write = fixture.operations.write;
    fixture.operations.write = async (path, value) => {
        if (path === paths.main)
            throw new Error('disk unavailable');
        await write(path, value);
    };
    await assert.rejects(savePersistedStoreFiles(fixture.operations, paths, createEmptyPersistedStore()), /disk unavailable/);
    assert.equal(fixture.files.get(paths.backup), validBackup);
});
//# sourceMappingURL=persistedFileStore.test.js.map