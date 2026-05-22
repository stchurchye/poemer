import { zh } from '../locales/zh-CN';
import { getStoredDialect } from './tts';

function isCantonese(): Promise<boolean> {
  return getStoredDialect().then((d) => d === 'cantonese');
}

/** 等待回复（普通话 / 粤语口语） */
export async function getAssistantThinkingLine(): Promise<string> {
  return (await isCantonese()) ? zh.writing.thinkingYue : zh.writing.thinkingZh;
}

/** 意图分析等待（普通话 / 粤语） */
export async function getAssistantIntentAnalyzingLine(): Promise<string> {
  return (await isCantonese()) ? zh.writing.intentAnalyzingYue : zh.writing.intentAnalyzingZh;
}

/** 等待较久时的提示 */
export async function getAssistantThinkingLongLine(): Promise<string> {
  return (await isCantonese()) ? zh.writing.thinkingLongYue : zh.writing.thinkingLongZh;
}

/** 问问题意图确认：朗读「小助手理解」时的口语前缀（仅此处使用） */
export async function getChatIntentUnderstandSpeakPrefix(): Promise<string> {
  return (await isCantonese())
    ? zh.chat.intentUnderstandSpeakPrefixYue
    : zh.chat.intentUnderstandSpeakPrefixZh;
}

/** 问问题意图确认：朗读理解后的按钮说明（仅 TTS） */
export async function getChatIntentConfirmActionHint(): Promise<string> {
  return (await isCantonese())
    ? zh.chat.intentConfirmActionHintYue
    : zh.chat.intentConfirmActionHintZh;
}

/** 问问题意图确认：完整朗读稿（前缀 + 理解 + 操作提示） */
export async function buildChatIntentConfirmSpeakText(displayText: string): Promise<string | null> {
  const trimmed = displayText.trim();
  if (!trimmed) return null;
  const prefix = await getChatIntentUnderstandSpeakPrefix();
  const hint = await getChatIntentConfirmActionHint();
  return `${prefix}${trimmed}。${hint}`;
}

/** 用户确认改稿后的等待话术（普通话 / 粤语） */
export async function getAssistantContinueLine(): Promise<string> {
  return (await isCantonese()) ? zh.writing.continueActionYue : zh.writing.continueActionZh;
}
