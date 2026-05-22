import {
  asrPromptForDialect,
  ZenMuxError,
  zenmuxOcr,
  zenmuxChatWithImages,
  verifyZenMuxKey,
  ZENMUX_BASE_URL,
  ZENMUX_MODEL_FLASH_LITE,
  type ReplyDialect,
  type ZenMuxChatImage,
} from '@shiren/shared';

export { ZenMuxError, zenmuxOcr, verifyZenMuxKey, zenmuxChatWithImages, type ZenMuxChatImage };

type ZenMuxTextPart = { type: 'text'; text: string };
type ZenMuxImagePart = { type: 'image_url'; image_url: { url: string } };
type ZenMuxAudioPart = {
  type: 'input_audio';
  input_audio: { data: string; format: string };
};
type ZenMuxContentPart = ZenMuxTextPart | ZenMuxImagePart | ZenMuxAudioPart;

type ZenMuxMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string | ZenMuxContentPart[];
};

async function zenmuxChat(
  apiKey: string,
  messages: ZenMuxMessage[],
  options?: { maxTokens?: number; temperature?: number; model?: string },
): Promise<string> {
  const res = await fetch(`${ZENMUX_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options?.model ?? ZENMUX_MODEL_FLASH_LITE,
      messages,
      stream: false,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.2,
    }),
  });

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    const msg = json.error?.message ?? `ZenMux 请求失败（${res.status}）`;
    throw new ZenMuxError(msg, res.status);
  }

  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new ZenMuxError('ZenMux 没有返回内容');
  return content;
}

export function getZenMuxKeyFromRequest(headerKey?: string | null): string {
  const fromHeader = headerKey?.trim();
  if (fromHeader) return fromHeader;
  const fromEnv = process.env.ZENMUX_API_KEY?.trim();
  if (!fromEnv) throw new ZenMuxError('ZENMUX_KEY_MISSING');
  return fromEnv;
}

export function hasZenMuxKeyConfigured(headerKey?: string | null): boolean {
  return Boolean(headerKey?.trim() || process.env.ZENMUX_API_KEY?.trim());
}

function normalizeAudioFormat(format: string): string {
  const f = format.trim().toLowerCase() || 'mp4';
  if (f === 'm4a' || f === 'aac') return 'mp4';
  if (f === 'caf') return 'wav';
  return f;
}

/** 语音转文字（Gemini 多模态，API 路径备用） */
export async function zenmuxTranscribe(params: {
  apiKey: string;
  audioBase64: string;
  format: string;
  dialect?: ReplyDialect;
}): Promise<string> {
  const format = normalizeAudioFormat(params.format);
  const data = params.audioBase64.replace(/\s/g, '');

  const text = await zenmuxChat(
    params.apiKey,
    [
      {
        role: 'user',
        content: [
          { type: 'text', text: asrPromptForDialect(params.dialect) },
          { type: 'input_audio', input_audio: { data, format } },
        ],
      },
    ],
    { maxTokens: 2048, temperature: 0.1 },
  );

  return text.trim();
}
