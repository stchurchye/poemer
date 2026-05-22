import { ZENMUX_BASE_URL, ZENMUX_MODEL_CHAT_IMAGES, ZENMUX_MODEL_FLASH_LITE } from './zenmux.js';
export class ZenMuxError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'ZenMuxError';
    }
}
async function zenmuxChat(apiKey, messages, options) {
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
    const json = (await res.json());
    if (!res.ok) {
        const msg = json.error?.message ?? `ZenMux 请求失败（${res.status}）`;
        throw new ZenMuxError(msg, res.status);
    }
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content)
        throw new ZenMuxError('ZenMux 没有返回内容');
    return content;
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
        model: ZENMUX_MODEL_CHAT_IMAGES,
        maxTokens: 4096,
        temperature: 0.5,
    });
}
export async function verifyZenMuxKey(apiKey) {
    await zenmuxChat(apiKey, [{ role: 'user', content: '请只回复：好的' }], {
        maxTokens: 16,
        temperature: 0,
    });
}
//# sourceMappingURL=zenmuxClient.js.map