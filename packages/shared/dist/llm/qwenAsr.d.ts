import type { ReplyDialect } from '../prompts/persona.js';
/** OpenAI 兼容模式（中国内地） */
export declare const DASHSCOPE_COMPAT_CHAT_ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
export declare const QWEN_ASR_MODEL = "qwen3-asr-flash";
/** 百炼 Qwen3-ASR-Flash 同步识别：单段最长 5 分钟 */
export declare const QWEN_ASR_MAX_DURATION_SEC = 300;
/** Data URL Base64 编码后不超过 10MB（见百炼文档） */
export declare const QWEN_ASR_MAX_BASE64_CHARS: number;
/** 按住说话提前松手的缓冲秒数，避免踩 API 上限 */
export declare const QWEN_ASR_RECORDING_SOFT_LIMIT_SEC = 285;
export type QwenAsrLimitReason = 'duration' | 'size';
export declare function getQwenAsrLimitViolation(audioBase64: string, durationSec?: number): QwenAsrLimitReason | null;
/** Base64 字符串约占用的字节数（编码后体积） */
export declare function qwenAsrBase64Bytes(base64: string): number;
export declare function qwenAsrPayloadSizeMb(base64: string): number;
export declare function qwenAsrLimitMessage(reason: QwenAsrLimitReason, base64?: string): string;
/** 将百炼 ASR 原始错误转成对用户友好的说明 */
export declare function formatQwenAsrApiError(raw: string | undefined, status?: number): string;
export type QwenAsrLanguage = 'zh' | 'yue';
/** 按 App 方言选择百炼 ASR 语种（粤语口语用 yue） */
export declare function qwenAsrLanguageForDialect(dialect?: ReplyDialect | null): QwenAsrLanguage;
/** 录音格式 → Data URL 的 MIME（见百炼 Qwen-ASR 文档） */
export declare function audioMimeFromAsrFormat(format: string): string;
//# sourceMappingURL=qwenAsr.d.ts.map