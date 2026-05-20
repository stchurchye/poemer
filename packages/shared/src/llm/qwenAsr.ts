import type { ReplyDialect } from '../prompts/persona.js';

/** OpenAI 兼容模式（中国内地） */
export const DASHSCOPE_COMPAT_CHAT_ENDPOINT =
  'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

export const QWEN_ASR_MODEL = 'qwen3-asr-flash';

export type QwenAsrLanguage = 'zh' | 'yue';

/** 按 App 方言选择百炼 ASR 语种（粤语口语用 yue） */
export function qwenAsrLanguageForDialect(dialect?: ReplyDialect | null): QwenAsrLanguage {
  return dialect === 'cantonese' ? 'yue' : 'zh';
}

/** 录音格式 → Data URL 的 MIME（见百炼 Qwen-ASR 文档） */
export function audioMimeFromAsrFormat(format: string): string {
  const f = format.trim().toLowerCase() || 'm4a';
  if (f === 'wav' || f === 'caf') return 'audio/wav';
  if (f === 'mp3' || f === 'mpeg') return 'audio/mpeg';
  if (f === 'm4a' || f === 'mp4' || f === 'aac') return 'audio/mp4';
  return 'audio/mp4';
}
