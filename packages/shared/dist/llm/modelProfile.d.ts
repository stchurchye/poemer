/**
 * 各模型的真实上下文窗口 / 单次输出上限。
 *
 * 取代原先全局单一的 DEFAULT_CONTEXT_WINDOW_TOKENS=300_000 —— 那个值既不按模型区分，
 * 又依赖 RN 下永远失效的 process.env 覆盖。数值来自 ZenMux / 各厂商文档（2026-07 核对）：
 * - google/gemini-3.1-flash-lite：输入 1,048,576 / 输出 65,536
 * - openai/gpt-5.4：标准输入 272,000（实验性可到 ~1.05M，这里取标准值保守）/ 输出 128,000
 * - deepseek-v4-pro：官方 V4 服务 1M 上下文；输出上限保守按 8,192
 *
 * 「尽量保原文」的前提是窗口取真实值：窗口越大，越少压缩、越多逐字历史。
 */
export type ModelProfile = {
    id: string;
    /** 上下文窗口（输入+输出合计上限，用于预算与压缩触发判断） */
    contextWindowTokens: number;
    /** 单次 completion 的最大输出 token（压缩调用的 completion maxTokens 不得超过它） */
    maxCompletionTokens: number;
};
/** 未知模型的保守兜底：取较小窗口，避免乐观放行导致上游超限 */
export declare const DEFAULT_MODEL_PROFILE: ModelProfile;
/** 按模型 ID 查真实 profile，未知模型回退到保守兜底 */
export declare function getModelProfile(modelId?: string | null): ModelProfile;
export declare function listKnownModelIds(): string[];
//# sourceMappingURL=modelProfile.d.ts.map