import { ZENMUX_ANTHROPIC_MESSAGES_URL, ZENMUX_BASE_URL, ZENMUX_MODEL_CHAT, ZENMUX_MODEL_FLASH_LITE, } from './zenmux.js';
export class ZenMuxError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'ZenMuxError';
    }
}
function buildWebSearchBody(webSearch) {
    if (!webSearch?.enabled)
        return undefined;
    const userLocation = {
        type: 'approximate',
        country: webSearch.country?.trim() || 'CN',
        timezone: webSearch.timezone?.trim() || 'Asia/Shanghai',
    };
    const city = webSearch.city?.trim();
    if (city)
        userLocation.city = city;
    const region = webSearch.region?.trim();
    if (region)
        userLocation.region = region;
    return {
        search_context_size: 'low',
        user_location: userLocation,
    };
}
function buildAnthropicWebSearchTool(webSearch) {
    const userLocation = {
        type: 'approximate',
        country: webSearch.country?.trim() || 'CN',
        timezone: webSearch.timezone?.trim() || 'Asia/Shanghai',
    };
    const city = webSearch.city?.trim();
    if (city)
        userLocation.city = city;
    const region = webSearch.region?.trim();
    if (region)
        userLocation.region = region;
    return {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 3,
        user_location: userLocation,
    };
}
function finalizeChatReply(raw, options, annotations) {
    if (options?.appendCitations) {
        return appendUrlCitations(raw, annotations);
    }
    return raw;
}
function appendCitationLines(content, cites) {
    if (cites.length === 0)
        return content;
    const unique = [...new Set(cites)];
    return `${content}\n\n参考来源：\n${unique.map((c) => `- ${c}`).join('\n')}`;
}
function appendUrlCitations(content, annotations) {
    if (!annotations?.length)
        return content;
    const cites = annotations
        .filter((a) => a.type === 'url_citation' && a.url_citation?.url?.trim())
        .map((a) => {
        const c = a.url_citation;
        const title = c.title?.trim();
        const url = c.url.trim();
        return title ? `${title}：${url}` : url;
    });
    return appendCitationLines(content, cites);
}
/** OpenAI 风格 messages → Anthropic system + 严格交替的 user/assistant */
function toAnthropicMessages(messages) {
    const systemParts = [];
    const turns = [];
    for (const msg of messages) {
        const text = msg.content.trim();
        if (!text)
            continue;
        if (msg.role === 'system') {
            systemParts.push(text);
            continue;
        }
        if (msg.role !== 'user' && msg.role !== 'assistant')
            continue;
        const last = turns[turns.length - 1];
        if (last?.role === msg.role) {
            last.content = `${last.content}\n\n${text}`;
        }
        else {
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
function parseAnthropicResponse(body, appendCitations = false) {
    const blocks = body.content ?? [];
    const textParts = blocks
        .filter((b) => b.type === 'text' && b.text?.trim())
        .map((b) => b.text.trim());
    const searchCites = [];
    for (const block of blocks) {
        if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content))
            continue;
        for (const item of block.content) {
            if (item.type !== 'web_search_result')
                continue;
            const url = item.url?.trim();
            if (!url)
                continue;
            const title = item.title?.trim();
            searchCites.push(title ? `${title}：${url}` : url);
        }
    }
    const answer = textParts.join('\n').trim();
    if (!answer) {
        throw new ZenMuxError('ZenMux 没有返回内容');
    }
    if (appendCitations) {
        return appendCitationLines(answer, searchCites);
    }
    return answer;
}
async function callAnthropicMessagesWithWebSearch(apiKey, messages, options) {
    const { system, messages: anthropicMessages } = toAnthropicMessages(messages);
    if (anthropicMessages.length === 0) {
        throw new ZenMuxError('消息为空');
    }
    const payload = {
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
    const json = (await res.json());
    if (!res.ok) {
        const msg = (typeof json.error === 'object' && json.error?.message) ||
            `ZenMux Anthropic 请求失败（${res.status}）`;
        throw new ZenMuxError(msg, res.status);
    }
    return parseAnthropicResponse(json, options.appendCitations);
}
function isPlainTextMessages(messages) {
    return messages.every((m) => typeof m.content === 'string');
}
function shouldUseAnthropicWebSearch(messages, options) {
    return Boolean(options?.webSearch?.enabled &&
        (options.model ?? '').startsWith('anthropic/') &&
        isPlainTextMessages(messages));
}
async function zenmuxChat(apiKey, messages, options) {
    const model = options?.model ?? ZENMUX_MODEL_FLASH_LITE;
    if (shouldUseAnthropicWebSearch(messages, options)) {
        return callAnthropicMessagesWithWebSearch(apiKey, messages, {
            ...options,
            model,
            webSearch: options.webSearch,
        });
    }
    const webSearchOptions = buildWebSearchBody(options?.webSearch);
    const body = {
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
    const json = (await res.json());
    if (!res.ok) {
        const msg = json.error?.message ?? `ZenMux 请求失败（${res.status}）`;
        throw new ZenMuxError(msg, res.status);
    }
    const message = json.choices?.[0]?.message;
    const raw = message?.content?.trim();
    if (!raw)
        throw new ZenMuxError('ZenMux 没有返回内容');
    return finalizeChatReply(raw, options, message?.annotations);
}
function imageDataUrl(imageBase64, mimeType) {
    const mime = mimeType?.trim() || 'image/jpeg';
    return `data:${mime};base64,${imageBase64.replace(/\s/g, '')}`;
}
/** 识图识字（Gemini 多模态） */
export async function zenmuxOcr(params) {
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
export async function zenmuxChatWithImages(params) {
    if (params.messages.length === 0) {
        throw new ZenMuxError('消息为空');
    }
    const last = params.messages[params.messages.length - 1];
    if (last.role !== 'user') {
        throw new ZenMuxError('最后一轮须为用户消息');
    }
    const userText = [params.imageNotice.trim(), last.content.trim()].filter(Boolean).join('\n\n');
    const imageParts = params.images.map((img) => ({
        type: 'image_url',
        image_url: { url: imageDataUrl(img.imageBase64, img.mimeType) },
    }));
    const zenmuxMessages = params.messages.slice(0, -1).map((m) => ({
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
/** 多轮纯文本对话（问问题回答，GPT-5.4） */
export async function zenmuxCompleteMessages(params) {
    return zenmuxChat(params.apiKey, params.messages, {
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        model: params.model,
        webSearch: params.webSearch,
    });
}
export async function verifyZenMuxKey(apiKey) {
    await zenmuxChat(apiKey, [{ role: 'user', content: '请只回复：好的' }], {
        maxTokens: 16,
        temperature: 0,
    });
}
//# sourceMappingURL=zenmuxClient.js.map