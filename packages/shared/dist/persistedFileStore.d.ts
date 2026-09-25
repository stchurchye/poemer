import { type PersistedStore } from './persistedStore.js';
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
export declare function savePersistedStoreFiles(operations: PersistedFileOperations, paths: PersistedStoreFilePaths, store: PersistedStore): Promise<void>;
export declare function loadPersistedStoreFiles(operations: PersistedFileOperations, paths: PersistedStoreFilePaths): Promise<PersistedStoreFileLoadResult>;
//# sourceMappingURL=persistedFileStore.d.ts.map