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
/**
 * 兜底窗口：仅当无法解析模型 profile 时使用。真实窗口按模型走 getModelProfile()。
 * 取保守值（不再是乐观的 300k），避免未知模型下乐观放行导致上游超限。
 */
export declare const DEFAULT_CONTEXT_WINDOW_TOKENS = 272000;
export declare const DEFAULT_OUTPUT_RESERVE_TOKENS = 8000;
/**
 * LLM 压缩后摘要写入上下文时的裁剪上限（有界）。
 * 必须让「提示词邀请的摘要长度」折算成的输出 token 稳稳小于 completion 上限，
 * 否则模型会写超、被上游按 completion maxTokens 静默截断丢尾部。
 * 4000 tok 摘要 ≈ 6400 字，中文输出约 4800 token < 8192 completion 兜底上限。
 */
export declare const COMPACT_SUMMARY_MAX_TOKENS = 4000;
/** 压缩 completion 的默认 maxTokens（会再被模型真实输出上限 clamp）。用户偏好取高一点。 */
export declare const DEFAULT_COMPACT_COMPLETION_MAX_TOKENS = 16384;
export declare const COMPACT_THRESHOLD_RATIO = 0.9;
/** 兼容旧逻辑的字符换算系数（tokensToEstimatedChars / 展示用）；真实计量见 estimateTokens */
export declare const ESTIMATE_CHARS_PER_TOKEN = 1.6;
/** 语言感知计量：CJK 每字约 0.75 token（比旧 0.625 保守）；其它字符约 0.25 token（≈4 字符/token） */
export declare const CJK_TOKENS_PER_CHAR = 0.75;
export declare const OTHER_TOKENS_PER_CHAR = 0.25;
export declare const SUMMARY_PREFIX = "\u3010\u6B64\u524D\u5BF9\u8BDD\u6458\u8981\u3011\n";
/** 上下文窗口：按模型真实窗口；env 覆盖仅作运维口子（RN 无 process.env 时自然走 profile） */
export declare function getContextWindowTokens(modelId?: string | null): number;
export declare function getOutputReserveTokens(): number;
/** 摘要写入上下文时的裁剪上限（字数上限），与 completion maxTokens 是两个独立量 */
export declare function getCompactSummaryMaxTokens(): number;
/**
 * 压缩调用（model.complete）的 maxTokens：受模型真实单次输出上限约束。
 * 修 B1：绝不把 getCompactSummaryMaxTokens()（大值）当作 completion maxTokens 透传给上游。
 */
export declare function getCompactCompletionMaxTokens(modelId?: string | null): number;
/** 将摘要正文裁到 COMPACT_SUMMARY_MAX_TOKENS，再包上前缀 */
export declare function formatContextSummaryText(raw: string | null | undefined): string;
/**
 * 语言感知 token 估算（修 B4）：中文按 ~0.75 token/字（比旧 chars/1.6=0.625 保守，防静默溢出），
 * 其它字符按 ~0.25 token/字。整套预算/触发/裁切都建于此。
 */
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
    modelId?: string | null;
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
    modelId?: string | null;
}): AssembleWritingIntentResult;
export declare function assembleWritingExecuteContext(params: {
    systemPrompt: string;
    /** 不可截断段（用户指令、风格、范围说明、章标题）——始终 100% 送达 */
    pinnedParts?: string[];
    /** 可截断段（本章正文、全篇节选）——超预算时优先在这里裁 */
    trimmableParts?: string[];
    limitTokens?: number;
    outputReserve?: number;
    modelId?: string | null;
}): {
    messages: ContextChatMessage[];
    usage: ContextUsage;
    userContent: string;
};
/**
 * 按 token 预算裁剪文本，裁剪结果（含压缩提示尾注）严格 <= maxTokens。
 * 与语言感知的 estimateTokens 一致（二分找最长前缀），中文也不会因固定系数而超预算。
 */
export declare function trimTextToTokenBudget(text: string, maxTokens: number): string;
/**
 * 按 token 预算裁剪，但保留文本【末尾】（续写场景需要「从哪接着写」的尾部而非开头）。
 * 结果（含「（前文略）」提示）严格 <= maxTokens。
 */
export declare function trimTextToTokenBudgetTail(text: string, maxTokens: number): string;
export declare function shouldCompact(usage: ContextUsage): boolean;
export {};
//# sourceMappingURL=contextBudget.d.ts.map