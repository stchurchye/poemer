import type { ChatMessage, ChatSession, Document, Revision, WritingAssistantMessage } from './types.js';
export declare const SHIREN_EXPORT_FORMAT_VERSION = 1;
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
export declare function createEmptyPersistedStore(): PersistedStore;
export declare function isPersistedStore(value: unknown): value is PersistedStore;
export declare function makeShirenExportBundle(store: PersistedStore, options?: {
    appVersion?: string;
    exportedAt?: string;
}): ShirenExportBundle;
export declare function isShirenExportBundle(value: unknown): value is ShirenExportBundle;
//# sourceMappingURL=persistedStore.d.ts.map