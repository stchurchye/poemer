import type { Block, Chapter, ChatMessage, ChatSession, Document, Revision, WritingAssistantMessage } from '../types.js';
import type { PersistedStore } from '../persistedStore.js';
type Clock = () => string;
type IdFactory = () => string;
export declare function findBlock(doc: Document, blockId: string): {
    chapter: Chapter;
    block: Block;
} | undefined;
export declare function createLocalStore(initial: PersistedStore, deps?: {
    now?: Clock;
    uuid?: IdFactory;
}): {
    snapshot: () => PersistedStore;
    replace: (next: PersistedStore) => void;
    createDocument: (title: string) => Document;
    listDocuments: () => Document[];
    getDocument: (id: string) => Document | undefined;
    updateDocument: (id: string, patch: Partial<Document>) => Document | undefined;
    saveDocumentContent: (documentId: string, chapterId: string, blockId: string, content: string) => Document | undefined;
    addChapter: (documentId: string, title?: string) => Document | undefined;
    createRevision: (input: Omit<Revision, "id" | "createdAt" | "timezone">) => Revision;
    acceptRevision: (revisionId: string, editedSnapshot?: string) => Revision | undefined;
    rejectRevision: (revisionId: string) => Revision | undefined;
    listRevisions: (documentId: string) => Revision[];
    getRevision: (revisionId: string) => Revision | undefined;
    rollback: (documentId: string, revisionId: string) => Revision | undefined;
    createChatSession: (title: string) => ChatSession;
    listChatSessions: () => ChatSession[];
    getChatSession: (sessionId: string) => ChatSession | undefined;
    updateChatSessionContext: (sessionId: string, contextSummary: string, contextSummaryUpToMessageId: string | null) => ChatSession | undefined;
    updateDocumentContextFields: (documentId: string, fields: {
        writingContextSummary?: string | null;
        writingContextSummaryUpToMessageId?: string | null;
        documentContextSummary?: string | null;
    }) => Document | undefined;
    updateChatSessionTitle: (sessionId: string, title: string) => ChatSession | undefined;
    getChatMessages: (sessionId: string) => ChatMessage[];
    addChatMessage: (sessionId: string, role: "user" | "assistant", content: string) => ChatMessage | undefined;
    getWritingAssistantMessages: (documentId: string) => WritingAssistantMessage[];
    addWritingAssistantMessage: (input: Omit<WritingAssistantMessage, "id" | "createdAt">) => WritingAssistantMessage | undefined;
    updateWritingAssistantMessage: (documentId: string, messageId: string, patch: Partial<WritingAssistantMessage>) => WritingAssistantMessage | undefined;
    getWritingAssistantMessage: (documentId: string, messageId: string) => WritingAssistantMessage | undefined;
    ensureWritingAssistantWelcome: (documentId: string, welcomeText: string) => void;
    findBlock: (docId: string, blockId: string) => {
        chapter: Chapter;
        block: Block;
    } | undefined;
};
export type LocalStore = ReturnType<typeof createLocalStore>;
export {};
//# sourceMappingURL=createLocalStore.d.ts.map