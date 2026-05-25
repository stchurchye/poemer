import {
  ZENMUX_ANTHROPIC_MESSAGES_URL,
  ZENMUX_BASE_URL,
  ZENMUX_MODEL_CHAT,
  ZENMUX_MODEL_FLASH_LITE,
} from './zenmux.js';

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

type PlainTextMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ZenMuxWebSearchOptions = {
  enabled: boolean;
  city?: string;
  country?: string;
  region?: string;
  timezone?: string;
};

type ZenMuxChatOptions = {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  webSearch?: ZenMuxWebSearchOptions;
  /** 是否在回复末尾自动拼接「参考来源」；问问题默认关闭 */
  appendCitations?: boolean;
};

function buildWebSearchBody(webSearch?: ZenMuxWebSearchOptions): Record<string, unknown> | undefined {
  if (!webSearch?.enabled) return undefined;
  const userLocation: Record<string, string> = {
    type: 'approximate',
    country: webSearch.country?.trim() || 'CN',
    timezone: webSearch.timezone?.trim() || 'Asia/Shanghai',
  };
  const city = webSearch.city?.trim();
  if (city) userLocation.city = city;
  const region = webSearch.region?.trim();
  if (region) userLocation.region = region;
  return {
    search_context_size: 'medium',
    user_location: userLocation,
  };
}

function buildAnthropicWebSearchTool(webSearch: ZenMuxWebSearchOptions): Record<string, unknown> {
  const userLocation: Record<string, string> = {
    type: 'approximate',
    country: webSearch.country?.trim() || 'CN',
    timezone: webSearch.timezone?.trim() || 'Asia/Shanghai',
  };
  const city = webSearch.city?.trim();
  if (city) userLocation.city = city;
  const region = webSearch.region?.trim();
  if (region) userLocation.region = region;
  return {
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: 3,
    user_location: userLocation,
  };
}

type UrlCitationAnnotation = {
  type?: string;
  url_citation?: { title?: string; url?: string };
};

function appendCitationLines(content: string, cites: string[]): string {
  if (cites.length === 0) return content;
  const unique = [...new Set(cites)];
  return `${content}\n\n参考来源：\n${unique.map((c) => `- ${c}`).join('\n')}`;
}

function appendUrlCitations(content: string, annotations?: UrlCitationAnnotation[]): string {
  if (!annotations?.length) return content;
  const cites = annotations
    .filter((a) => a.type === 'url_citation' && a.url_citation?.url?.trim())
    .map((a) => {
      const c = a.url_citation!;
      const title = c.title?.trim();
      const url = c.url!.trim();
      return title ? `${title}：${url}` : url;
    });
  return appendCitationLines(content, cites);
}

/** OpenAI 风格 messages → Anthropic system + 严格交替的 user/assistant */
function toAnthropicMessages(messages: PlainTextMessage[]): {
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
} {
  const systemParts: string[] = [];
  const turns: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const msg of messages) {
    const text = msg.content.trim();
    if (!text) continue;
    if (msg.role === 'system') {
      systemParts.push(text);
      continue;
    }
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;
    const last = turns[turns.length - 1];
    if (last?.role === msg.role) {
      last.content = `${last.content}\n\n${text}`;
    } else {
      turns.push({ role: msg.role, content: text });
    }
  }

  if (turns.length > 0 && turns[0].role === 'assistant') {
    turns.unshift({ role: 'user', content: '（继续上文对话）' });
  }

  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    messages: turns,
  };
}

type AnthropicContentBlock = {
  type?: string;
  text?: string;
  content?: Array<{ type?: string; title?: string; url?: string }>;
};

function parseAnthropicResponse(
  body: { content?: AnthropicContentBlock[] },
  appendCitations = false,
): string {
  const blocks = body.content ?? [];
  const textParts = blocks
    .filter((b) => b.type === 'text' && b.text?.trim())
    .map((b) => b.text!.trim());

  const searchCites: string[] = [];
  for (const block of blocks) {
    if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue;
    for (const item of block.content) {
      if (item.type !== 'web_search_result') continue;
      const url = item.url?.trim();
      if (!url) continue;
      const title = item.title?.trim();
      searchCites.push(title ? `${title}：${url}` : url);
    }
  }

  const answer = textParts.join('\n').trim();
  if (!answer) {
    throw new ZenMuxError('ZenMux 没有返回内容');
  }
  return appendCitations ? appendCitationLines(answer, searchCites) : answer;
}

async function callAnthropicMessagesWithWebSearch(
  apiKey: string,
  messages: PlainTextMessage[],
  options: ZenMuxChatOptions & { model: string; webSearch: ZenMuxWebSearchOptions },
): Promise<string> {
  const { system, messages: anthropicMessages } = toAnthropicMessages(messages);
  if (anthropicMessages.length === 0) {
    throw new ZenMuxError('消息为空');
  }

  const payload: Record<string, unknown> = {
    model: options.model,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.5,
    messages: anthropicMessages,
    tools: [buildAnthropicWebSearchTool(options.webSearch)],
  };
  if (system) {
    payload.system = system;
  }

  const res = await fetch(ZENMUX_ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });

  const json = (await res.json()) as {
    content?: AnthropicContentBlock[];
    error?: { message?: string; type?: string };
  };

  if (!res.ok) {
    const msg =
      (typeof json.error === 'object' && json.error?.message) ||
      `ZenMux Anthropic 请求失败（${res.status}）`;
    throw new ZenMuxError(msg, res.status);
  }

  return parseAnthropicResponse(json, options.appendCitations);
}

function isPlainTextMessages(
  messages: ZenMuxMessage[],
): messages is PlainTextMessage[] {
  return messages.every((m) => typeof m.content === 'string');
}

function shouldUseAnthropicWebSearch(
  messages: ZenMuxMessage[],
  options?: ZenMuxChatOptions,
): boolean {
  return Boolean(
    options?.webSearch?.enabled &&
    (options.model ?? '').startsWith('anthropic/') &&
    isPlainTextMessages(messages),
  );
}

async function zenmuxChat(
  apiKey: string,
  messages: ZenMuxMessage[],
  options?: ZenMuxChatOptions,
): Promise<string> {
  const model = options?.model ?? ZENMUX_MODEL_FLASH_LITE;

  if (shouldUseAnthropicWebSearch(messages, options)) {
    return callAnthropicMessagesWithWebSearch(
      apiKey,
      messages as PlainTextMessage[],
      {
        ...options,
        model,
        webSearch: options!.webSearch!,
      },
    );
  }

  const webSearchOptions = buildWebSearchBody(options?.webSearch);
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
    max_tokens: options?.maxTokens ?? 4096,
    temperature: options?.temperature ?? 0.2,
  };
  if (webSearchOptions) {
    body.web_search_options = webSearchOptions;
  }

  const res = await fetch(`${ZENMUX_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string; annotations?: UrlCitationAnnotation[] };
    }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    const msg = json.error?.message ?? `ZenMux 请求失败（${res.status}）`;
    throw new ZenMuxError(msg, res.status);
  }

  const message = json.choices?.[0]?.message;
  const raw = message?.content?.trim();
  if (!raw) throw new ZenMuxError('ZenMux 没有返回内容');
  return options?.appendCitations
    ? appendUrlCitations(raw, message?.annotations)
    : raw;
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
    model: ZENMUX_MODEL_CHAT,
    maxTokens: 4096,
    temperature: 0.5,
  });
}

/** 多轮纯文本对话（问问题回答，Claude Sonnet 4.6） */
export async function zenmuxCompleteMessages(params: {
  apiKey: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  webSearch?: ZenMuxWebSearchOptions;
}): Promise<string> {
  return zenmuxChat(params.apiKey, params.messages, {
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    model: params.model,
    webSearch: params.webSearch,
  });
}

export async function verifyZenMuxKey(apiKey: string): Promise<void> {
  await zenmuxChat(apiKey, [{ role: 'user', content: '请只回复：好的' }], {
    maxTokens: 16,
    temperature: 0,
  });
}
