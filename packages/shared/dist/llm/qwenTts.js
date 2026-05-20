/** 阿里云百炼 DashScope（北京地域默认） */
export const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1';
export const DASHSCOPE_TTS_ENDPOINT = `${DASHSCOPE_BASE_URL}/services/aigc/multimodal-generation/generation`;
/** 非实时语音合成模型（普通话） */
export const QWEN_TTS_MODEL = 'qwen3-tts-flash';
/** 单次请求建议上限（官方最长 600 字符） */
export const QWEN_TTS_MAX_CHARS = 600;
/** 普通话内置音色（qwen3-tts-flash） */
export const QWEN_TTS_VOICES_MANDARIN = [
    { id: 'Cherry', label: 'Cherry · 阳光女声' },
    { id: 'Serena', label: 'Serena · 温柔女声' },
    { id: 'Ethan', label: 'Ethan · 活力男声' },
    { id: 'Chelsie', label: 'Chelsie · 甜美女声' },
    { id: 'Momo', label: 'Momo · 俏皮女声' },
    { id: 'Kai', label: 'Kai · 沉稳男声' },
    { id: 'Maia', label: 'Maia · 知性女声' },
    { id: 'Moon', label: 'Moon · 磁性男声' },
    { id: 'Seren', label: 'Seren · 轻柔女声' },
    { id: 'Eldric Sage', label: 'Eldric Sage · 睿智长者' },
];
/** 粤语内置音色 */
export const QWEN_TTS_VOICES_CANTONESE = [
    { id: 'Kiki', label: 'Kiki · 粤语甜美女声' },
    { id: 'Rocky', label: 'Rocky · 粤语男声' },
];
/** @deprecated 使用 qwenVoicesForDialect */
export const QWEN_TTS_VOICES = QWEN_TTS_VOICES_MANDARIN;
export const QWEN_TTS_DEFAULT_VOICE_MANDARIN = 'Cherry';
export const QWEN_TTS_DEFAULT_VOICE_CANTONESE = 'Kiki';
/** @deprecated 使用 qwenDefaultVoice */
export const QWEN_TTS_DEFAULT_VOICE = QWEN_TTS_DEFAULT_VOICE_MANDARIN;
/** 统一用 chinese（勿用 auto，分段时易被判成普通话） */
export function qwenLanguageType(dialect) {
    void dialect;
    return 'chinese';
}
/** 粤语 Kiki/Rocky 仅支持 qwen3-tts-flash，与普通话同模型、不同音色 */
export function qwenTtsModelForDialect(dialect) {
    void dialect;
    return QWEN_TTS_MODEL;
}
/** 确保粤语不会误用普通话音色（否则念着念着变国语） */
export function resolveQwenVoiceForDialect(dialect, voice) {
    const allowed = qwenVoicesForDialect(dialect);
    const v = voice?.trim();
    if (v && allowed.some((item) => item.id === v))
        return v;
    return qwenDefaultVoice(dialect);
}
export function qwenVoicesForDialect(dialect) {
    return dialect === 'cantonese' ? QWEN_TTS_VOICES_CANTONESE : QWEN_TTS_VOICES_MANDARIN;
}
export function qwenDefaultVoice(dialect) {
    return dialect === 'cantonese'
        ? QWEN_TTS_DEFAULT_VOICE_CANTONESE
        : QWEN_TTS_DEFAULT_VOICE_MANDARIN;
}
//# sourceMappingURL=qwenTts.js.map