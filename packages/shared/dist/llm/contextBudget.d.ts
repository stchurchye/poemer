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
    /** 上次实际发送时平台返回的真实 prompt token（供详情弹窗「实际用量」行），发送前为空 */
    actualPromptTokens?: number;
};
export declare const DEFAULT_CONTEXT_WINDOW_TOKENS = 300000;
export declare const DEFAULT_OUTPUT_RESERVE_TOKENS = 8000;
/**
 * 「软工作窗口」：模型物理窗口（300k）很大，但日常聊天/写作远到不了，
 * 致使压缩几乎不触发、用量圆环永远接近 0%。这里设更小的软目标来真正驱动
 * 滑动窗口与摘要压缩；物理窗口仍由 getContextWindowTokens() 作安全上限。
 */
export declare const DEFAULT_CHAT_WORKING_WINDOW_TOKENS = 24000;
/** 写作侧栏要容纳「待改本章 + 全篇节选」，窗口略大 */
export declare const DEFAULT_WRITING_WORKING_WINDOW_TOKENS = 48000;
/** LLM 压缩后的摘要/全篇摘要写入上下文时的 token 上限（真正起到压缩作用） */
export declare const COMPACT_SUMMARY_MAX_TOKENS = 2500;
export declare const COMPACT_THRESHOLD_RATIO = 0.7;
export declare const ESTIMATE_CHARS_PER_TOKEN = 1.6;
export declare const SUMMARY_PREFIX = "\u3010\u6B64\u524D\u5BF9\u8BDD\u6458\u8981\u3011\n";
export declare function getContextWindowTokens(): number;
export declare function getOutputReserveTokens(): number;
export declare function getCompactSummaryMaxTokens(): number;
/** 问答对话的软工作窗口（驱动滑窗 + 压缩，可用 env CHAT_WORKING_WINDOW_TOKENS 覆盖） */
export declare function getChatWorkingWindowTokens(): number;
/** 写作侧栏的软工作窗口（可用 env WRITING_WORKING_WINDOW_TOKENS 覆盖） */
export declare function getWritingWorkingWindowTokens(): number;
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