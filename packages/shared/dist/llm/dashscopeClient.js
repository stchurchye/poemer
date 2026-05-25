import { audioMimeFromAsrFormat, DASHSCOPE_COMPAT_CHAT_ENDPOINT, formatQwenAsrApiError, getQwenAsrLimitViolation, QWEN_ASR_MODEL, qwenAsrLanguageForDialect, qwenAsrLimitMessage, } from './qwenAsr.js';
import { DASHSCOPE_TTS_ENDPOINT, QWEN_TTS_MAX_CHARS, QWEN_TTS_MODEL, resolveQwenVoiceForDialect, } from './qwenTts.js';
export class DashScopeError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'DashScopeError';
    }
}
function parseDialect(raw) {
    return raw?.trim().toLowerCase() === 'cantonese' ? 'cantonese' : 'mandarin';
}
function toHttpsUrl(url) {
    return url.replace(/^http:\/\//i, 'https://');
}
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++)
        binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}
async function fetchAudioBase64(url) {
    const secure = toHttpsUrl(url);
    const res = await fetch(secure);
    if (!res.ok) {
        throw new DashScopeError(`音频下载失败（${res.status}）`, res.status);
    }
    return arrayBufferToBase64(await res.arrayBuffer());
}
export async function qwen3TtsSynthesize(opts) {
    const text = opts.text.trim();
    if (!text)
        throw new DashScopeError('朗读内容为空');
    if (text.length > QWEN_TTS_MAX_CHARS) {
        throw new DashScopeError(`单次朗读不超过 ${QWEN_TTS_MAX_CHARS} 字，请分段朗读`);
    }
    const dialect = parseDialect(opts.dialect);
    const voice = resolveQwenVoiceForDialect(dialect, opts.voice);
    const res = await fetch(DASHSCOPE_TTS_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
            model: QWEN_TTS_MODEL,
            input: {
                text,
                voice,
                language_type: 'chinese',
            },
        }),
    });
    const json = (await res.json());
    const inlineB64 = json.output?.audio?.data?.trim();
    const rawUrl = json.output?.audio?.url?.trim();
    if (!res.ok || (!rawUrl && !inlineB64)) {
        const msg = json.message || json.code || `Qwen3-TTS 请求失败（${res.status}）`;
        throw new DashScopeError(msg, res.status);
    }
    if (inlineB64) {
        const audioUrl = rawUrl ? toHttpsUrl(rawUrl) : '';
        return { audioUrl, audioBase64: inlineB64.replace(/\s/g, '') };
    }
    const audioUrl = toHttpsUrl(rawUrl);
    const audioBase64 = await fetchAudioBase64(audioUrl);
    return { audioUrl, audioBase64 };
}
export async function qwen3AsrTranscribe(opts) {
    const raw = opts.audioBase64.replace(/\s/g, '');
    if (!raw)
        throw new DashScopeError('音频数据为空');
    const limit = getQwenAsrLimitViolation(raw, opts.durationSec);
    if (limit)
        throw new DashScopeError(qwenAsrLimitMessage(limit, raw), 400);
    const mime = audioMimeFromAsrFormat(opts.format);
    const dataUri = `data:${mime};base64,${raw}`;
    const language = qwenAsrLanguageForDialect(opts.dialect);
    const res = await fetch(DASHSCOPE_COMPAT_CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
            model: QWEN_ASR_MODEL,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'input_audio',
                            input_audio: { data: dataUri },
                        },
                    ],
                },
            ],
            stream: false,
            asr_options: {
                language,
                enable_itn: false,
            },
        }),
    });
    const json = (await res.json());
    const text = json.choices?.[0]?.message?.content?.trim() ?? '';
    if (!res.ok || !text) {
        const rawMsg = json.error?.message || json.message || json.code;
        const msg = formatQwenAsrApiError(rawMsg, res.status);
        throw new DashScopeError(msg, res.status);
    }
    return text;
}
export async function verifyDashScopeKey(apiKey) {
    await qwen3TtsSynthesize({
        apiKey,
        text: '您好，朗读测试。',
        dialect: 'mandarin',
    });
}
//# sourceMappingURL=dashscopeClient.js.map