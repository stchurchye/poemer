import type { Document, WritingAssistantMessage, WritingUnderstandingScope } from './types.js';
export type { WritingUnderstandingScope } from './types.js';
/** 写作小助手历史：供 LLM 上下文（排除等待条、改稿完成条、用户点「不对」的整轮） */
export declare function filterWritingMessagesForContext(messages: WritingAssistantMessage[]): WritingAssistantMessage[];
export declare const WRITING_CHAPTER_ONLY_SCOPE_NOTE = "\uFF08\u7528\u6237\u8981\u6C42\u4EC5\u6839\u636E\u672C\u7AE0\u7406\u89E3\uFF0C\u5DF2\u7701\u7565\u5176\u5B83\u7AE0\u8282\u6B63\u6587\uFF09";
export declare const WRITING_FULL_ARTICLE_BLOCK_PREFIX = "\u6574\u7BC7\u6587\u7AE0\u6309\u7AE0\u5217\u51FA\uFF08\u4F9B\u7406\u89E3\uFF1B\u8BC4\u4EF7\u4E0E\u6539\u7A3F\u4ECD\u53EA\u9488\u5BF9\u300C\u5F53\u524D\u5F85\u6539\u7AE0\u8282\u300D\uFF09\uFF1A";
/**
 * 按 order 格式化每一章，当前章在全文 excerpt 中标注。
 *
 * 修 A3：超过 MAX_DOCUMENT_EXCERPT 后，尾章不再整章静默丢弃，而是降级为「标题占位」，
 * 保证每一章的标题都出现在上下文里；被折叠章节的正文通过可选的 `foldedOut` 收集返回，
 * 供上层触发全篇摘要兜底（R-NoSilentLoss）。当前待改章永远优先保留正文。
 */
export declare function formatArticleChaptersForLlm(doc: Document, activeChapterId: string, foldedOut?: string[]): string;
export declare function buildWritingChapterBlock(chapterTitle: string, chapterContent: string): string;
export declare function buildWritingDocumentBlock(documentExcerpt: string): string;
/** API / 移动端统一：当前章 block + 全篇按章 block */
export declare function buildWritingAssistantContextBlocks(input: {
    chapterTitle: string;
    chapterContent: string;
    documentExcerpt: string;
    referenceScope?: WritingUnderstandingScope;
}): {
    chapterBlock: string;
    documentBlock: string;
};
/** 写作小助手：待改章节 + 全篇按章（供 LLM 理解，改稿仍只改一章） */
export declare function buildWritingAssistantChapterContext(doc: Document, chapterId: string, chapterDraft?: string): {
    chapterId: string;
    chapterTitle: string;
    chapterContent: string;
    documentExcerpt: string;
    hasMultipleChapters: boolean;
};
//# sourceMappingURL=writingAssistantContext.d.ts.map