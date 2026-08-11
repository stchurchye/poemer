import * as SecureStore from 'expo-secure-store';

/**
 * 「文字消息直接发送」开关：默认关（保留发送前的整理确认，对长辈是一层保护）。
 * 打开后，普通文字问题跳过 DeepSeek 意图整理那一次往返、直接回答，更快；
 * 但遇到改文章/改字、改字体/声音/语言/换话题等仍会先走意图（见 textNeedsIntentReview）。
 */
const SKIP_INTENT_REVIEW_KEY = 'shiren_skip_intent_review';

/** 进程内缓存：切换后立即生效，同会话内避免重复读盘 */
let memorySkipIntentReview: boolean | null = null;

export function getMemorySkipIntentReview(): boolean {
  return memorySkipIntentReview ?? false;
}

export async function getStoredSkipIntentReview(): Promise<boolean> {
  if (memorySkipIntentReview != null) return memorySkipIntentReview;
  try {
    const v = await SecureStore.getItemAsync(SKIP_INTENT_REVIEW_KEY);
    const next = v === '1';
    memorySkipIntentReview = next;
    return next;
  } catch {
    memorySkipIntentReview = false;
    return false;
  }
}

export async function setStoredSkipIntentReview(value: boolean): Promise<void> {
  memorySkipIntentReview = value;
  await SecureStore.setItemAsync(SKIP_INTENT_REVIEW_KEY, value ? '1' : '0');
}

// 即便开了「直接发送」，下列文本仍走完整意图整理，以保留产品行为：
// - 改文章/改稿/润色等 → 「改文章请去写作页」重定向
// - 改字体/声音/语言/换话题/改标题 → 设置引导弹窗
// 用多字模式而非单个「改」字，尽量减少误命中（如「改善睡眠」不会触发）。
const WRITING_HINT_RE =
  /(改文章|改稿|润色|续写|扩写|缩写|改一下|改下|帮(我|您)改|改改|改成|改这|改那|改正文|改段|改句|改写)/;
const SETTINGS_HINT_RE =
  /(字体|字号|字大|字小|放大字|声音|朗读|嗓音|人声|普通话|粤语|换语言|换话题|聊别的|新话题|标题|题目|文章名)/;

/** 返回 true 表示这段文本建议保留意图分析（不要直接发送） */
export function textNeedsIntentReview(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return WRITING_HINT_RE.test(t) || SETTINGS_HINT_RE.test(t);
}
