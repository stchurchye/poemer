export const SHIREN_EXPORT_FORMAT_VERSION = 1;
export function createEmptyPersistedStore() {
    return {
        documents: [],
        revisions: [],
        chatSessions: [],
        chatMessages: {},
        writingAssistantMessages: {},
    };
}
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isRecordOfArrays(value) {
    return isObject(value) && Object.values(value).every((entry) => Array.isArray(entry));
}
function isValidDocument(value) {
    if (!isObject(value))
        return false;
    return (typeof value.id === 'string' &&
        typeof value.title === 'string' &&
        Array.isArray(value.chapters) &&
        value.chapters.every((ch) => isObject(ch) &&
            typeof ch.id === 'string' &&
            Array.isArray(ch.blocks) &&
            ch.blocks.every((b) => isObject(b) && typeof b.id === 'string' && typeof b.content === 'string')));
}
export function isPersistedStore(value) {
    if (!isObject(value))
        return false;
    if (!Array.isArray(value.documents) ||
        !Array.isArray(value.revisions) ||
        !Array.isArray(value.chatSessions) ||
        !isRecordOfArrays(value.chatMessages) ||
        !isRecordOfArrays(value.writingAssistantMessages)) {
        return false;
    }
    return value.documents.every(isValidDocument);
}
export function makeShirenExportBundle(store, options) {
    return {
        formatVersion: SHIREN_EXPORT_FORMAT_VERSION,
        exportedAt: options?.exportedAt ?? new Date().toISOString(),
        appVersion: options?.appVersion ?? 'unknown',
        store,
    };
}
export function isShirenExportBundle(value) {
    if (!isObject(value))
        return false;
    return (value.formatVersion === SHIREN_EXPORT_FORMAT_VERSION &&
        typeof value.exportedAt === 'string' &&
        typeof value.appVersion === 'string' &&
        isPersistedStore(value.store));
}
//# sourceMappingURL=persistedStore.js.map