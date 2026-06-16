import { fetch as expoFetch } from 'expo/fetch';
import type { ModelClient, ModelCompletionInput, ModelStreamCallbacks } from '@shiren/engine';
import {
  ZenMuxError,
  ZENMUX_BASE_URL,
  ZENMUX_MODEL_FLASH_LITE,
  buildWebSearchBody,
  parseZenMuxSseChunk,
  zenmuxCompleteMessages,
  type ModelTokenUsage,
} from '@shiren/shared';
import { getZenMuxApiKey } from './zenmuxKey';
import { LocalModelError } from './localModelClient';
import { logLlmFailure, logLlmSuccess } from './llmLog';

export function createZenMuxModelClient(options?: {
  model?: string;
  webSearch?: boolean;
  label?: string;
}): ModelClient {
  const defaultModel = options?.model ?? ZENMUX_MODEL_FLASH_LITE;
  const label = options?.label ?? 'ZenMux';
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
        logLlmFailure({
          label,
          provider: 'zenmux',
          model: defaultModel,
          startedAt: Date.now(),
          errorCode: 'MODEL_KEY_MISSING',
          errorMessage: '未设置 ZenMux 密钥',
        });
        throw new LocalModelError(
          '请先在设置里填写 ZenMux 密钥',
          'MODEL_KEY_MISSING',
          '问问题文字与带图回答需要 ZenMux（GPT-5.4）。',
        );
      }
      const startedAt = Date.now();
      let status: number | undefined;
      let usage: ModelTokenUsage | undefined;
      try {
        const text = await zenmuxCompleteMessages({
          apiKey: key,
          messages: input.messages,
          maxTokens: input.maxTokens,
          temperature: input.temperature ?? (webSearch ? 0.2 : undefined),
          model: defaultModel,
          webSearch,
          onMeta: (meta) => {
            status = meta.status;
            usage = meta.usage;
          },
        });
        logLlmSuccess({
          label,
          provider: 'zenmux',
          model: defaultModel,
          status,
          startedAt,
          contentLen: text.length,
          usage,
        });
        return { text, usage };
      } catch (e) {
        if (e instanceof ZenMuxError) {
          logLlmFailure({
            label,
            provider: 'zenmux',
            model: defaultModel,
            status: e.status,
            startedAt,
            errorCode: 'MODEL_BAD_RESPONSE',
            errorMessage: e.message,
          });
          throw new LocalModelError(
            e.message,
            'MODEL_BAD_RESPONSE',
            '请稍后再试，或检查 ZenMux 密钥是否仍然可用。',
          );
        }
        if (e instanceof LocalModelError) throw e;
        logLlmFailure({
          label,
          provider: 'zenmux',
          model: defaultModel,
          status,
          startedAt,
          errorCode: 'MODEL_NETWORK',
          errorMessage: (e as Error)?.message,
        });
        throw new LocalModelError(
          'ZenMux 暂时连不上',
          'MODEL_NETWORK',
          '请检查手机网络后再试。',
        );
      }
    },

    async completeStream(input: ModelCompletionInput, cb: ModelStreamCallbacks) {
      const key = await getZenMuxApiKey();
      if (!key) {
        logLlmFailure({
          label,
          provider: 'zenmux',
          model: defaultModel,
          startedAt: Date.now(),
          errorCode: 'MODEL_KEY_MISSING',
          errorMessage: '未设置 ZenMux 密钥',
        });
        throw new LocalModelError(
          '请先在设置里填写 ZenMux 密钥',
          'MODEL_KEY_MISSING',
          '问问题文字与带图回答需要 ZenMux（GPT-5.4）。',
        );
      }
      // Anthropic 模型不走 OpenAI 兼容流式：降级为非流式，一次性回调全文
      if (defaultModel.startsWith('anthropic/')) {
        const res = await this.complete(input);
        if (res.text) cb.onDelta(res.text);
        return res;
      }

      const startedAt = Date.now();
      let usage: ModelTokenUsage | undefined;
      try {
        const webSearchBody = buildWebSearchBody(webSearch);
        const body: Record<string, unknown> = {
          model: defaultModel,
          messages: input.messages,
          stream: true,
          stream_options: { include_usage: true },
          max_tokens: input.maxTokens ?? 4096,
          temperature: input.temperature ?? (webSearch ? 0.2 : undefined),
        };
        if (webSearchBody) body.web_search_options = webSearchBody;

        const res = await expoFetch(`${ZENMUX_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(body),
          signal: cb.signal,
        });

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => '');
          throw new ZenMuxError(errText.slice(0, 200) || `ZenMux 流式请求失败（${res.status}）`, res.status);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let acc = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseZenMuxSseChunk(buffer);
          buffer = parsed.rest;
          if (parsed.usage) usage = parsed.usage;
          for (const d of parsed.deltas) {
            acc += d;
            cb.onDelta(d);
          }
          if (parsed.done) break;
        }

        const text = acc.trim();
        if (!text) throw new ZenMuxError('ZenMux 没有返回内容');
        logLlmSuccess({
          label,
          provider: 'zenmux',
          model: defaultModel,
          status: res.status,
          startedAt,
          contentLen: text.length,
          usage,
        });
        return { text, usage };
      } catch (e) {
        // 用户取消（切会话/退出）：静默抛出，不记失败
        if ((e as Error)?.name === 'AbortError') throw e;
        if (e instanceof ZenMuxError) {
          logLlmFailure({
            label,
            provider: 'zenmux',
            model: defaultModel,
            status: e.status,
            startedAt,
            errorCode: 'MODEL_BAD_RESPONSE',
            errorMessage: e.message,
          });
          throw new LocalModelError(
            e.message,
            'MODEL_BAD_RESPONSE',
            '请稍后再试，或检查 ZenMux 密钥是否仍然可用。',
          );
        }
        if (e instanceof LocalModelError) throw e;
        logLlmFailure({
          label,
          provider: 'zenmux',
          model: defaultModel,
          startedAt,
          errorCode: 'MODEL_NETWORK',
          errorMessage: (e as Error)?.message,
        });
        throw new LocalModelError(
          'ZenMux 暂时连不上',
          'MODEL_NETWORK',
          '请检查手机网络后再试。',
        );
      }
    },
  };
}
