/** 上下文 token 预算与组装（问答 / 写作小助手共用） */
export type ContextChatMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};
export type ContextUsageBreakdown = {
    system: number;
    summary: number;
    history: number;
    document: number;
    pendingUser: number;
    outputReserve: number;
};
export type ContextBreakdownKey = keyof ContextUsageBreakdown;
export type ContextBreakdownMeta = {
    key: ContextBreakdownKey;
    labelZh: string;
    color: string;
};
/** 上下文分类展示顺序与配色（弹窗图例 / 分段条） */
export declare const CONTEXT_BREAKDOWN_META: readonly ContextBreakdownMeta[];
export type ContextUsage = {
    usedTokens: number;
    limitTokens: number;
    ratio: number;
    breakdown: ContextUsageBreakdown;
    compacted: boolean;
    droppedVerbatimTurns: number;
};
export declare const DEFAULT_CONTEXT_WINDOW_TOKENS = 300000;
export declare const DEFAULT_OUTPUT_RESERVE_TOKENS = 8000;
/** LLM 压缩后的摘要/全篇摘要写入上下文时的 token 上限 */
export declare const COMPACT_SUMMARY_MAX_TOKENS = 100000;
export declare const COMPACT_THRESHOLD_RATIO = 0.8;
export declare const ESTIMATE_CHARS_PER_TOKEN = 1.6;
export declare const SUMMARY_PREFIX = "\u3010\u6B64\u524D\u5BF9\u8BDD\u6458\u8981\u3011\n";
export declare function getContextWindowTokens(): number;
export declare function getOutputReserveTokens(): number;
export declare function getCompactSummaryMaxTokens(): number;
/** 将摘要正文裁到 COMPACT_SUMMARY_MAX_TOKENS，再包上前缀 */
export declare function formatContextSummaryText(raw: string | null | undefined): string;
export declare function estimateTokens(text: string): number;
export declare function formatTokenCount(n: number): string;
export declare function tokensToEstimatedChars(tokens: number): number;
export declare function formatCharCount(n: number): string;
export declare function getContextBreakdownSegments(breakdown: ContextUsageBreakdown): {
    key: ContextBreakdownKey;
    tokens: number;
    labelZh: string;
    color: string;
}[];
/** 用户可见用量：不计「待发送」，用于圆环/详情占比 */
export declare function contextUsageForDisplay(usage: ContextUsage): ContextUsage;
/** 图例分段：不展示待发送 */
export declare function getContextBreakdownSegmentsForDisplay(breakdown: ContextUsageBreakdown): {
    key: ContextBreakdownKey;
    tokens: number;
    labelZh: string;
    color: string;
}[];
type HistoryTurn = {
    role: 'user' | 'assistant';
    content: string;
};
export type AssembleChatResult = {
    messages: ContextChatMessage[];
    usage: ContextUsage;
    needsCompact: boolean;
    messagesToCompact: HistoryTurn[];
};
export declare function assembleChatContext(params: {
    systemPrompt: string;
    summary?: string | null;
    history: HistoryTurn[];
    pendingUser: string;
    limitTokens?: number;
    outputReserve?: number;
}): AssembleChatResult;
export type AssembleWritingIntentResult = {
    messages: ContextChatMessage[];
    usage: ContextUsage;
    needsCompact: boolean;
    messagesToCompact: HistoryTurn[];
    documentBlockForModel: string;
};
export declare function assembleWritingIntentContext(params: {
    systemPrompt: string;
    summary?: string | null;
    history: HistoryTurn[];
    chapterBlock: string;
    documentBlock: string;
    userMessage: string;
    limitTokens?: number;
    outputReserve?: number;
}): AssembleWritingIntentResult;
export declare function assembleWritingExecuteContext(params: {
    systemPrompt: string;
    userParts: string[];
    limitTokens?: number;
    outputReserve?: number;
}): {
    messages: ContextChatMessage[];
    usage: ContextUsage;
    userContent: string;
};
export declare function trimTextToTokenBudget(text: string, maxTokens: number): string;
export declare function shouldCompact(usage: ContextUsage): boolean;
export {};
//# sourceMappingURL=contextBudget.d.ts.map