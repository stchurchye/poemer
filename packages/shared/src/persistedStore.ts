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
  return isObject(value) && Object.values(value).every((entry) => Array.isArray(entry));
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
