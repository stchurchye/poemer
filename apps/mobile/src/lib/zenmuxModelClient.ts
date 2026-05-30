import type { ModelClient, ModelCompletionInput } from '@shiren/engine';
import { ZenMuxError, ZENMUX_MODEL_FLASH_LITE, zenmuxCompleteMessages } from '@shiren/shared';
import { getZenMuxApiKey } from './zenmuxKey';
import { LocalModelError } from './localModelClient';

export function createZenMuxModelClient(options?: {
  model?: string;
  webSearch?: boolean;
}): ModelClient {
  const defaultModel = options?.model ?? ZENMUX_MODEL_FLASH_LITE;
  const webSearch = options?.webSearch
    ? {
        enabled: true as const,
        city: 'Zhongshan',
        region: 'Guangdong',
        country: 'CN',
        timezone: 'Asia/Shanghai',
      }
    : undefined;
  return {
    async complete(input: ModelCompletionInput) {
      const key = await getZenMuxApiKey();
      if (!key) {
        throw new LocalModelError(
          '请先在设置里填写 ZenMux 密钥',
          'MODEL_KEY_MISSING',
          '问问题文字与带图回答需要 ZenMux（GPT-5.4）。',
        );
      }
      try {
        const text = await zenmuxCompleteMessages({
          apiKey: key,
          messages: input.messages,
          maxTokens: input.maxTokens,
          temperature: input.temperature ?? (webSearch ? 0.2 : undefined),
          model: defaultModel,
          webSearch,
        });
        return { text };
      } catch (e) {
        if (e instanceof ZenMuxError) {
          throw new LocalModelError(
            e.message,
            'MODEL_BAD_RESPONSE',
            '请稍后再试，或检查 ZenMux 密钥是否仍然可用。',
          );
        }
        if (e instanceof LocalModelError) throw e;
        throw new LocalModelError(
          'ZenMux 暂时连不上',
          'MODEL_NETWORK',
          '请检查手机网络后再试。',
        );
      }
    },
  };
}
