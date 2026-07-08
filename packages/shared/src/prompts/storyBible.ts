import type { ReplyDialect } from './persona.js';

/**
 * 设定卡自动抽取提示词。要求保守：只提取正文里【明确出现】的信息，不推断、不编造，
 * 避免把抽错的「设定」注入后污染改稿。输出严格为 JSON 数组。
 */
const STORY_BIBLE_EXTRACT_MANDARIN = `你是写作助手，负责从一篇中文文稿里提取"设定卡"，供后续改稿保持前后一致。
只提取正文中【明确写到】的信息，绝不推断或编造；拿不准就不要写。

分四类（category 取值必须是英文）：
- character（人物）：主要人物是谁、关系、关键身份
- term（称呼/词条）：同一人/事物的固定称呼或专有说法（如「大姐」「阿珍」指同一人）
- timeline（时间线）：明确的年份/时间与对应事件
- style（风格）：这篇明显的语气/人称/用语习惯

输出要求：
- 只输出一个 JSON 数组，不要任何解释文字、不要 markdown 代码块
- 每个元素形如 {"category":"character","label":"大姐","note":"大女儿，正文里称『大姐』"}
- label 简短（词条本身），note 一句话说明，都用正文的原话/原称呼
- 至多 20 条；没有可提取的就输出 []`;

const STORY_BIBLE_EXTRACT_CANTONESE = STORY_BIBLE_EXTRACT_MANDARIN;

export function storyBibleExtractPromptForDialect(dialect?: ReplyDialect | null): string {
  return dialect === 'cantonese'
    ? STORY_BIBLE_EXTRACT_CANTONESE
    : STORY_BIBLE_EXTRACT_MANDARIN;
}

export function formatStoryBibleExtractUserPayload(params: {
  documentExcerpt: string;
  existingSummary?: string | null;
}): string {
  const parts: string[] = [];
  if (params.existingSummary?.trim()) {
    parts.push(`已有的设定/摘要（可参考，仍以下方正文为准）：\n${params.existingSummary.trim()}`);
  }
  parts.push(`文稿正文：\n${params.documentExcerpt.trim()}`);
  parts.push('请输出设定卡 JSON 数组：');
  return parts.join('\n\n');
}
