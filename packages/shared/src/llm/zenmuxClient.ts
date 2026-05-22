import { ZENMUX_BASE_URL, ZENMUX_MODEL_CHAT_IMAGES, ZENMUX_MODEL_FLASH_LITE } from './zenmux.js';

export type ZenMuxChatImage = { imageBase64: string; mimeType?: string };

export class ZenMuxError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'ZenMuxError';
  }
}

type ZenMuxTextPart = { type: 'text'; text: string };
type ZenMuxImagePart = { type: 'image_url'; image_url: { url: string } };
type ZenMuxContentPart = ZenMuxTextPart | ZenMuxImagePart;

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

function imageDataUrl(imageBase64: string, mimeType?: string): string {
  const mime = mimeType?.trim() || 'image/jpeg';
  return `data:${mime};base64,${imageBase64.replace(/\s/g, '')}`;
}

/** 识图识字（Gemini 多模态） */
export async function zenmuxOcr(params: {
  apiKey: string;
  imageBase64: string;
  mimeType?: string;
  purpose?: string;
}): Promise<string> {
  const dataUrl = imageDataUrl(params.imageBase64, params.mimeType);
  const instructions = params.purpose?.trim() ?? '';

  return zenmuxChat(params.apiKey, [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `${instructions ? `${instructions}\n\n` : ''}请识别图片中的中文或英文文字，按阅读顺序逐字转录原文。保留段落换行。不要纠正错别字、不要润色、不要补充或删减内容。不要加解释、标题或 markdown。若图中没有文字，只回复：（未识别到文字）`,
        },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    },
  ]);
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

export async function verifyZenMuxKey(apiKey: string): Promise<void> {
  await zenmuxChat(apiKey, [{ role: 'user', content: '请只回复：好的' }], {
    maxTokens: 16,
    temperature: 0,
  });
}
