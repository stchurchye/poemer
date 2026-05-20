import type { ReplyDialect } from '../prompts/persona.js';
/** OpenAI 兼容模式（中国内地） */
export declare const DASHSCOPE_COMPAT_CHAT_ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
export declare const QWEN_ASR_MODEL = "qwen3-asr-flash";
export type QwenAsrLanguage = 'zh' | 'yue';
/** 按 App 方言选择百炼 ASR 语种（粤语口语用 yue） */
export declare function qwenAsrLanguageForDialect(dialect?: ReplyDialect | null): QwenAsrLanguage;
/** 录音格式 → Data URL 的 MIME（见百炼 Qwen-ASR 文档） */
export declare function audioMimeFromAsrFormat(format: string): string;
//# sourceMappingURL=qwenAsr.d.ts.map