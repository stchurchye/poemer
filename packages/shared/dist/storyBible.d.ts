import type { StoryBible, StoryBibleCategory, StoryBibleEntry } from './types.js';
export declare const STORY_BIBLE_CATEGORY_LABELS: Record<StoryBibleCategory, string>;
/** 常驻块前缀；含「以正文为准」告示，避免抽错的设定强行左右改稿 */
export declare const STORY_BIBLE_BLOCK_PREFIX = "\u3010\u672C\u6587\u8BBE\u5B9A\u5361\uFF08\u8BF7\u4FDD\u6301\u524D\u540E\u4E00\u81F4\uFF1B\u82E5\u4E0E\u6B63\u6587\u51B2\u7A81\uFF0C\u4E00\u5F8B\u4EE5\u6B63\u6587\u4E3A\u51C6\uFF0C\u4E0D\u8981\u636E\u6B64\u6539\u52A8\u6B63\u6587\u4E8B\u5B9E\uFF09\u3011";
/** 把设定卡格式化成写作上下文里的常驻块；空则返回空串 */
export declare function formatStoryBibleForLlm(bible?: StoryBible | null): string;
/** 合并设定卡：同 label 用新 note 覆盖、新 label 追加，稳定去重 */
export declare function mergeStoryBible(existing: StoryBible | null | undefined, incoming: StoryBible): StoryBible;
/** 从模型输出里解析设定卡条目（宽松找 JSON 数组），非法/缺字段的丢弃，绝不抛错 */
export declare function parseStoryBibleEntries(raw: string): StoryBibleEntry[];
//# sourceMappingURL=storyBible.d.ts.map