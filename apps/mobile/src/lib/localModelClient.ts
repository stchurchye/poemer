import type { ModelClient, ModelCompletionInput } from '@shiren/engine';
import { DEEPSEEK_BASE_URL, DEEPSEEK_MODEL_PRO, type ModelTokenUsage } from '@shiren/shared';
import { getDeepSeekApiKey } from './deepseekKey';
import { logLlmFailure, logLlmSuccess } from './llmLog';

export class LocalModelError extends Error {
  constructor(
    message: string,
    public readonly code: 'MODEL_KEY_MISSING' | 'MODEL_NETWORK' | 'MODEL_BAD_RESPONSE',
    public readonly hint?: string,
  ) {
    super(message);
    this.name = 'LocalModelError';
  }
}

export function createDeepSeekModelClient(label = 'DeepSeek'): ModelClient {
  return {
    async complete(input: ModelCompletionInput) {
      const key = await getDeepSeekApiKey();
      if (!key) {
        logLlmFailure({
          label,
          provider: 'deepseek',
          model: DEEPSEEK_MODEL_PRO,
          startedAt: Date.now(),
          errorCode: 'MODEL_KEY_MISSING',
          errorMessage: '未设置 DeepSeek 密钥',
        });
        throw new LocalModelError(
          '请先在设置里填写 DeepSeek 密钥',
          'MODEL_KEY_MISSING',
          '用于问问题/写作意图识别、写作改稿、侧栏聊天；问问题正文还需 ZenMux 密钥。',
        );
      }
      const startedAt = Date.now();
      let status: number | undefined;
      try {
        const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: DEEPSEEK_MODEL_PRO,
            messages: input.messages,
            temperature: input.temperature ?? 0.3,
            max_tokens: input.maxTokens,
            // V4 Pro 默认开启深度思考，短/结构化请求常只回 reasoning_content、content 为空，
            // 会被下方判成「没响应」（表现与欠费相同）。显式关闭 thinking，确保走 content。
            thinking: { type: 'disabled' },
          }),
        });
        status = res.status;
        const json = (await res.json()) as {
          choices?: Array<{
            message?: { content?: string; reasoning_content?: string };
          }>;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
            prompt_cache_hit_tokens?: number;
            prompt_cache_miss_tokens?: number;
          };
          error?: { message?: string };
        };
        const message = json?.choices?.[0]?.message;
        const text = message?.content;
        const u = json?.usage;
        const usage: ModelTokenUsage | undefined = u
          ? {
              promptTokens: u.prompt_tokens,
              completionTokens: u.completion_tokens,
              totalTokens: u.total_tokens,
              cacheHitTokens: u.prompt_cache_hit_tokens,
              cacheMissTokens: u.prompt_cache_miss_tokens,
            }
          : undefined;
        if (!res.ok || typeof text !== 'string' || text.length === 0) {
          const reasoningOnly =
            res.ok && typeof message?.reasoning_content === 'string';
          logLlmFailure({
            label,
            provider: 'deepseek',
            model: DEEPSEEK_MODEL_PRO,
            status,
            startedAt,
            contentLen: typeof text === 'string' ? text.length : 0,
            reasoningOnly,
            errorCode: 'MODEL_BAD_RESPONSE',
            errorMessage: json?.error?.message,
          });
          // 关闭 thinking 后仍只拿到 reasoning_content → 是响应格式问题而非欠费，给出可区分的提示。
          const hint = reasoningOnly
            ? '模型只返回了思考内容、正文为空。请确认已关闭深度思考，或稍后再试。'
            : '请稍后再试，或检查密钥是否仍然可用。';
          throw new LocalModelError('AI 模型暂时没响应', 'MODEL_BAD_RESPONSE', hint);
        }
        logLlmSuccess({
          label,
          provider: 'deepseek',
          model: DEEPSEEK_MODEL_PRO,
          status,
          startedAt,
          contentLen: text.length,
          usage,
        });
        return { text, usage };
      } catch (e) {
        if (e instanceof LocalModelError) throw e;
        logLlmFailure({
          label,
          provider: 'deepseek',
          model: DEEPSEEK_MODEL_PRO,
          status,
          startedAt,
          errorCode: 'MODEL_NETWORK',
          errorMessage: (e as Error)?.message,
        });
        throw new LocalModelError(
          'AI 模型暂时连不上',
          'MODEL_NETWORK',
          '请检查手机网络后再试。文章和聊天记录已保存在本机。',
        );
      }
    },
  };
}

/** 用指定密钥测试（设置页验证，不写 SecureStore） */
export async function verifyDeepSeekKeyDirect(
  apiKey: string,
): Promise<{ valid: boolean; message: string }> {
  const key = apiKey.trim();
  if (!key) return { valid: false, message: '请先填入密钥' };
  const startedAt = Date.now();
  let status: number | undefined;
  try {
    const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL_PRO,
        messages: [{ role: 'user', content: '回复：好' }],
        max_tokens: 32,
        thinking: { type: 'disabled' },
      }),
    });
    status = res.status;
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
      error?: { message?: string };
    };
    const message = json?.choices?.[0]?.message;
    const text = message?.content;
    if (!res.ok || typeof text !== 'string' || text.length === 0) {
      logLlmFailure({
        label: 'DeepSeek·密钥测试',
        provider: 'deepseek',
        model: DEEPSEEK_MODEL_PRO,
        status,
        startedAt,
        contentLen: typeof text === 'string' ? text.length : 0,
        reasoningOnly: res.ok && typeof message?.reasoning_content === 'string',
        errorCode: 'VERIFY_FAIL',
        errorMessage: json?.error?.message,
      });
      return { valid: false, message: '密钥不可用，请检查是否复制完整' };
    }
    logLlmSuccess({
      label: 'DeepSeek·密钥测试',
      provider: 'deepseek',
      model: DEEPSEEK_MODEL_PRO,
      status,
      startedAt,
      contentLen: text.length,
    });
    return { valid: true, message: '密钥可用' };
  } catch (e) {
    logLlmFailure({
      label: 'DeepSeek·密钥测试',
      provider: 'deepseek',
      model: DEEPSEEK_MODEL_PRO,
      status,
      startedAt,
      errorCode: 'MODEL_NETWORK',
      errorMessage: (e as Error)?.message,
    });
    return { valid: false, message: '暂时连不上模型服务，请检查网络' };
  }
}
