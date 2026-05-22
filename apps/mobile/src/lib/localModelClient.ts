import type { ModelClient, ModelCompletionInput } from '@shiren/engine';
import { DEEPSEEK_BASE_URL, DEEPSEEK_MODEL_PRO } from '@shiren/shared';
import { getDeepSeekApiKey } from './deepseekKey';

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

export function createDeepSeekModelClient(): ModelClient {
  return {
    async complete(input: ModelCompletionInput) {
      const key = await getDeepSeekApiKey();
      if (!key) {
        throw new LocalModelError(
          '请先在设置里填写小助手密钥',
          'MODEL_KEY_MISSING',
          '文章和聊天记录仍在本机；只有 AI 改稿和问问题需要密钥。',
        );
      }
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
          }),
        });
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = json?.choices?.[0]?.message?.content;
        if (!res.ok || typeof text !== 'string') {
          throw new LocalModelError(
            'AI 模型暂时没响应',
            'MODEL_BAD_RESPONSE',
            '请稍后再试，或检查密钥是否仍然可用。',
          );
        }
        return { text };
      } catch (e) {
        if (e instanceof LocalModelError) throw e;
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
        max_tokens: 8,
      }),
    });
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json?.choices?.[0]?.message?.content;
    if (!res.ok || typeof text !== 'string') {
      return { valid: false, message: '密钥不可用，请检查是否复制完整' };
    }
    return { valid: true, message: '密钥可用' };
  } catch {
    return { valid: false, message: '暂时连不上模型服务，请检查网络' };
  }
}
