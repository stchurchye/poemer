import {
  formatStoryBibleExtractUserPayload,
  getCompactCompletionMaxTokens,
  mergeStoryBible,
  parseStoryBibleEntries,
  storyBibleExtractPromptForDialect,
  type ReplyDialect,
  type StoryBible,
} from '@shiren/shared';
import type { ModelClient } from './modelClient.js';

/**
 * 从文稿正文自动抽取/更新设定卡（人物/称呼/时间线/风格）。
 * 保守 temperature、结果与既有设定卡合并；解析失败则返回既有设定卡（不清空、不抛错）。
 */
export async function extractStoryBible(params: {
  model: ModelClient;
  documentExcerpt: string;
  existing?: StoryBible | null;
  existingSummary?: string | null;
  dialect?: ReplyDialect;
}): Promise<StoryBible> {
  const existing = params.existing ?? { entries: [] };
  if (!params.documentExcerpt.trim()) return existing;

  let text: string;
  try {
    const res = await params.model.complete({
      messages: [
        { role: 'system', content: storyBibleExtractPromptForDialect(params.dialect) },
        {
          role: 'user',
          content: formatStoryBibleExtractUserPayload({
            documentExcerpt: params.documentExcerpt,
            existingSummary: params.existingSummary,
          }),
        },
      ],
      temperature: 0.1,
      maxTokens: getCompactCompletionMaxTokens(),
    });
    text = res.text;
  } catch {
    // 抽取是锦上添花，失败不影响主流程，保留既有设定卡
    return existing;
  }

  const entries = parseStoryBibleEntries(text);
  if (entries.length === 0) return existing;
  return mergeStoryBible(existing, { entries });
}
