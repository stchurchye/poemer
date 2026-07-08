const MODEL_PROFILES = {
    'openai/gpt-5.4': {
        id: 'openai/gpt-5.4',
        contextWindowTokens: 272_000,
        maxCompletionTokens: 128_000,
    },
    'openai/gpt-5.4-mini': {
        id: 'openai/gpt-5.4-mini',
        contextWindowTokens: 272_000,
        maxCompletionTokens: 128_000,
    },
    'google/gemini-3.1-flash-lite': {
        id: 'google/gemini-3.1-flash-lite',
        contextWindowTokens: 1_048_576,
        maxCompletionTokens: 65_536,
    },
    // 写作侧(API legacy)回复模型：DeepSeek 家族向来 128k 窗口，保守取值防组装超上游窗口
    'deepseek-v4-pro': {
        id: 'deepseek-v4-pro',
        contextWindowTokens: 128_000,
        maxCompletionTokens: 8_192,
    },
};
/** 未知模型的保守兜底：取较小窗口，避免乐观放行导致上游超限 */
export const DEFAULT_MODEL_PROFILE = {
    id: 'default',
    contextWindowTokens: 272_000,
    maxCompletionTokens: 8_192,
};
/** 按模型 ID 查真实 profile，未知模型回退到保守兜底 */
export function getModelProfile(modelId) {
    if (modelId && MODEL_PROFILES[modelId])
        return MODEL_PROFILES[modelId];
    return DEFAULT_MODEL_PROFILE;
}
export function listKnownModelIds() {
    return Object.keys(MODEL_PROFILES);
}
//# sourceMappingURL=modelProfile.js.map