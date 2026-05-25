/** ZenMux 聚合平台（OpenAI 兼容） */
export const ZENMUX_BASE_URL = 'https://zenmux.ai/api/v1';
/** Claude 联网搜索须走 Anthropic Messages（Chat Completions 的 web_search_options 对 Claude 无效） */
export const ZENMUX_ANTHROPIC_MESSAGES_URL = 'https://zenmux.ai/api/anthropic/v1/messages';
/** @see https://zenmux.ai/google/gemini-3.1-flash-lite */
export const ZENMUX_MODEL_FLASH_LITE = 'google/gemini-3.1-flash-lite';
/** 问问题回答（纯文字与带图） @see https://zenmux.ai/anthropic/claude-sonnet-4.6 */
export const ZENMUX_MODEL_CHAT = 'anthropic/claude-sonnet-4.6';
/** @deprecated 使用 ZENMUX_MODEL_CHAT */
export const ZENMUX_MODEL_CHAT_IMAGES = ZENMUX_MODEL_CHAT;
//# sourceMappingURL=zenmux.js.map