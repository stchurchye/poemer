/** OpenAI 兼容模式（中国内地） */
export const DASHSCOPE_COMPAT_CHAT_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
export const QWEN_ASR_MODEL = 'qwen3-asr-flash';
/** 百炼 Qwen3-ASR-Flash 同步识别：单段最长 5 分钟 */
export const QWEN_ASR_MAX_DURATION_SEC = 300;
/** Data URL Base64 编码后不超过 10MB（见百炼文档） */
export const QWEN_ASR_MAX_BASE64_CHARS = 10 * 1024 * 1024;
/** 按住说话提前松手的缓冲秒数，避免踩 API 上限 */
export const QWEN_ASR_RECORDING_SOFT_LIMIT_SEC = 285;
export function getQwenAsrLimitViolation(audioBase64, durationSec) {
    const raw = audioBase64.replace(/\s/g, '');
    if (raw.length > QWEN_ASR_MAX_BASE64_CHARS)
        return 'size';
    if (durationSec != null && durationSec > QWEN_ASR_MAX_DURATION_SEC)
        return 'duration';
    return null;
}
/** Base64 字符串约占用的字节数（编码后体积） */
export function qwenAsrBase64Bytes(base64) {
    return base64.replace(/\s/g, '').length;
}
export function qwenAsrPayloadSizeMb(base64) {
    return qwenAsrBase64Bytes(base64) / (1024 * 1024);
}
export function qwenAsrLimitMessage(reason, base64) {
    if (reason === 'size') {
        const mb = base64 ? qwenAsrPayloadSizeMb(base64).toFixed(1) : '';
        return mb
            ? `这段语音约 ${mb}MB，超过了云端听写上限，请分成几段说`
            : '这段语音文件太大，请分成几段说';
    }
    return '您说得有点久，请分成几段说，每段不超过五分钟';
}
/** 将百炼 ASR 原始错误转成对用户友好的说明 */
export function formatQwenAsrApiError(raw, status) {
    const msg = (raw ?? '').trim();
    const lower = msg.toLowerCase();
    if (status === 400 &&
        (lower.includes('duration') ||
            lower.includes('length') ||
            lower.includes('size') ||
            lower.includes('too large') ||
            lower.includes('too long') ||
            lower.includes('过长') ||
            lower.includes('超出') ||
            lower.includes('limit'))) {
        return qwenAsrLimitMessage('duration');
    }
    if (msg && !/^语音识别失败/.test(msg))
        return msg;
    if (status === 400) {
        return '录音暂时无法识别，请再按住说一次；若仍不行，可到「我的」检查听写密钥';
    }
    return msg || `语音识别失败（${status ?? ''}）`;
}
/** 按 App 方言选择百炼 ASR 语种（粤语口语用 yue） */
export function qwenAsrLanguageForDialect(dialect) {
    return dialect === 'cantonese' ? 'yue' : 'zh';
}
/** 录音格式 → Data URL 的 MIME（见百炼 Qwen-ASR 文档） */
export function audioMimeFromAsrFormat(format) {
    const f = format.trim().toLowerCase() || 'm4a';
    if (f === 'wav' || f === 'caf')
        return 'audio/wav';
    if (f === 'mp3' || f === 'mpeg')
        return 'audio/mpeg';
    if (f === '3gp' || f === 'amr')
        return 'audio/amr';
    if (f === 'm4a' || f === 'mp4' || f === 'aac')
        return 'audio/mp4';
    return 'audio/mp4';
}
//# sourceMappingURL=qwenAsr.js.map