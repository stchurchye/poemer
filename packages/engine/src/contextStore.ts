import type {
  ChatMessage,
  ChatSession,
  Document,
  StoryBible,
  WritingAssistantMessage,
} from '@shiren/shared';

/** 上下文管线所需的存储读写（LocalStore 或 API db 均可实现） */
export type ContextStoreAdapter = {
  getChatSession(sessionId: string): ChatSession | undefined;
  getChatMessages(sessionId: string): ChatMessage[];
  updateChatSessionContext(
    sessionId: string,
    contextSummary: string,
    contextSummaryUpToMessageId: string | null,
  ): ChatSession | undefined;
  getDocument(documentId: string): Document | undefined;
  getWritingAssistantMessages(documentId: string): WritingAssistantMessage[];
  updateDocumentContextFields(
    documentId: string,
    fields: {
      writingContextSummary?: string | null;
      writingContextSummaryUpToMessageId?: string | null;
      documentContextSummary?: string | null;
      storyBible?: StoryBible | null;
    },
  ): Document | undefined;
};
