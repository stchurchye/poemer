/** 阿里云百炼 DashScope（北京地域默认） */
export declare const DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/api/v1";
export declare const DASHSCOPE_TTS_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
/** 非实时语音合成模型（普通话） */
export declare const QWEN_TTS_MODEL = "qwen3-tts-flash";
/** 单次请求建议上限（官方最长 600 字符） */
export declare const QWEN_TTS_MAX_CHARS = 600;
export type QwenTtsDialect = 'mandarin' | 'cantonese';
export type QwenTtsVoice = {
    id: string;
    label: string;
};
/** 普通话内置音色（qwen3-tts-flash） */
export declare const QWEN_TTS_VOICES_MANDARIN: QwenTtsVoice[];
/** 粤语内置音色 */
export declare const QWEN_TTS_VOICES_CANTONESE: QwenTtsVoice[];
/** @deprecated 使用 qwenVoicesForDialect */
export declare const QWEN_TTS_VOICES: QwenTtsVoice[];
export declare const QWEN_TTS_DEFAULT_VOICE_MANDARIN = "Cherry";
export declare const QWEN_TTS_DEFAULT_VOICE_CANTONESE = "Kiki";
/** @deprecated 使用 qwenDefaultVoice */
export declare const QWEN_TTS_DEFAULT_VOICE = "Cherry";
/** DashScope qwen3-tts-flash 接受的 language_type（小写） */
export type QwenTtsLanguageType = 'chinese' | 'auto' | 'english' | 'german' | 'italian' | 'portuguese' | 'spanish' | 'japanese' | 'korean' | 'french' | 'russian';
/** 统一用 chinese（勿用 auto，分段时易被判成普通话） */
export declare function qwenLanguageType(dialect: QwenTtsDialect): QwenTtsLanguageType;
/** 粤语 Kiki/Rocky 仅支持 qwen3-tts-flash，与普通话同模型、不同音色 */
export declare function qwenTtsModelForDialect(dialect: QwenTtsDialect): string;
/** 确保粤语不会误用普通话音色（否则念着念着变国语） */
export declare function resolveQwenVoiceForDialect(dialect: QwenTtsDialect, voice?: string | null): string;
export declare function qwenVoicesForDialect(dialect: QwenTtsDialect): QwenTtsVoice[];
export declare function qwenDefaultVoice(dialect: QwenTtsDialect): string;
//# sourceMappingURL=qwenTts.d.ts.map