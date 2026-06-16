/**
 * 统一的真实 token 用量。
 *
 * 各 provider 响应里的原始字段命名不同（DeepSeek/OpenAI 用 snake_case 的
 * prompt_tokens…，Anthropic 用 input_tokens/cache_read_input_tokens…），
 * 在各自的 client 里映射到这套中性的驼峰字段，engine / UI / 日志层只认这一套。
 * 全部可选：拿不到 usage 的旧路径/旧记录不受影响。
 */
export type ModelTokenUsage = {
  /** 输入（prompt）token；Anthropic 路径指「未命中缓存的余量」，真实输入还需加上缓存读写 */
  promptTokens?: number;
  /** 输出（completion）token */
  completionTokens?: number;
  totalTokens?: number;
  /**
   * 命中缓存的 prompt token：
   * DeepSeek `prompt_cache_hit_tokens` / Anthropic `cache_read_input_tokens` /
   * OpenAI 兼容 `prompt_tokens_details.cached_tokens`
   */
  cacheHitTokens?: number;
  /** 未命中缓存的 prompt token：DeepSeek `prompt_cache_miss_tokens` */
  cacheMissTokens?: number;
  /** 写入缓存的 token：Anthropic `cache_creation_input_tokens`（DeepSeek 无此概念） */
  cacheWriteTokens?: number;
};
