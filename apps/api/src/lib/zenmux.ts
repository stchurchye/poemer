import {
  asrPromptForDialect,
  ZenMuxError,
  zenmuxOcr,
  verifyZenMuxKey,
  ZENMUX_BASE_URL,
  ZENMUX_MODEL_CHAT_IMAGES,
  ZENMUX_MODEL_FLASH_LITE,
  type ReplyDialect,
} from '@shiren/shared';

export { ZenMuxError, zenmuxOcr, verifyZenMuxKey };

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

export type ZenMuxChatImage = { imageBase64: string; mimeType?: string };

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

function imageDataUrl(imageBase64: string, mimeType?: string): string {
  const mime = mimeType?.trim() || 'image/jpeg';
  return `data:${mime};base64,${imageBase64.replace(/\s/g, '')}`;
}

/** 问答带图：在最后一轮用户话上附加图片（历史均为纯文本） */
export async function zenmuxChatWithImages(params: {
  apiKey: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  images: ZenMuxChatImage[];
  imageNotice: string;
}): Promise<string> {
  if (params.messages.length === 0) {
    throw new ZenMuxError('消息为空');
  }
  const last = params.messages[params.messages.length - 1];
  if (last.role !== 'user') {
    throw new ZenMuxError('最后一轮须为用户消息');
  }

  const userText = [params.imageNotice.trim(), last.content.trim()].filter(Boolean).join('\n\n');
  const imageParts: ZenMuxImagePart[] = params.images.map((img) => ({
    type: 'image_url',
    image_url: { url: imageDataUrl(img.imageBase64, img.mimeType) },
  }));

  const zenmuxMessages: ZenMuxMessage[] = params.messages.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  zenmuxMessages.push({
    role: 'user',
    content: [{ type: 'text', text: userText }, ...imageParts],
  });

  return zenmuxChat(params.apiKey, zenmuxMessages, {
    model: ZENMUX_MODEL_CHAT_IMAGES,
    maxTokens: 4096,
    temperature: 0.5,
  });
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
