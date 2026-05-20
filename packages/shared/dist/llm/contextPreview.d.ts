import type { AssembleChatResult, AssembleWritingIntentResult, ContextChatMessage, ContextUsage } from './contextBudget.js';
export type ContextBlockKind = 'system' | 'summary' | 'history_user' | 'history_assistant' | 'document_chapter' | 'document_excerpt' | 'pending_user';
export type ContextPreviewBlock = {
    id: string;
    kind: ContextBlockKind;
    label: string;
    content: string;
    tokens: number;
    selectable: boolean;
    selectedByDefault: boolean;
    messageId?: string;
    role?: 'user' | 'assistant';
    omittedByBudget?: boolean;
};
export type ContextPreview = {
    blocks: ContextPreviewBlock[];
    usage: ContextUsage;
    messages: ContextChatMessage[];
};
export type ContextSelection = {
    excludedBlockIds?: string[];
    excludedMessageIds?: string[];
    /** @deprecated 仅兼容旧客户端 */
    selectedMessageIds?: string[];
    /** @deprecated */
    selectedBlockIds?: string[];
};
export declare function usesExclusionMode(selection?: ContextSelection | null): boolean;
export declare function contextSelectionWithServerMarks<T>(_allMessages: T[], contextSelection?: ContextSelection | null): ContextSelection | undefined;
export declare function formatMessagesAsMarkdown(messages: ContextChatMessage[]): string;
export declare function exclusionFromBlocks(blocks: ContextPreviewBlock[], selectedBlockIds: string[]): ContextSelection;
export declare function selectedBlockIdsFromExclusion(blocks: ContextPreviewBlock[], selection: ContextSelection): string[];
export declare function defaultSelectedBlockIds(blocks: ContextPreviewBlock[]): string[];
export declare function blocksFromAssembleChatResult(assembled: AssembleChatResult, opts?: {
    historyMessageIds?: string[];
    excludedMessageIds?: string[];
}): ContextPreview;
export declare function blocksFromWritingIntent(assembled: AssembleWritingIntentResult, opts: {
    chapterBlock: string;
    documentBlock: string;
    historyMessageIds?: string[];
    excludedMessageIds?: string[];
    excludedBlockIds?: string[];
}): ContextPreview;
export declare function filterHistoryTurns<T extends {
    role: string;
    content: string;
    id?: string;
}>(history: T[], selection?: ContextSelection | null): T[];
//# sourceMappingURL=contextPreview.d.ts.map