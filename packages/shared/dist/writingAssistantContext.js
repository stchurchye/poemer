import { assistantRejectConfirmLine } from './prompts/assistantCopy.js';
const REJECT_ACK_LINES = new Set([
    assistantRejectConfirmLine('mandarin'),
    assistantRejectConfirmLine('cantonese'),
]);
/** 写作小助手历史：供 LLM 上下文（排除等待条、改稿完成条、用户点「不对」的整轮） */
export function filterWritingMessagesForContext(messages) {
    const excludedIds = new Set();
    for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        if (m.kind !== 'intent_confirm' || m.confirmStatus !== 'rejected')
            continue;
        excludedIds.add(m.id);
        const prev = messages[i - 1];
        if (prev?.role === 'user')
            excludedIds.add(prev.id);
        const next = messages[i + 1];
        if (next?.role === 'assistant' &&
            next.kind === 'chat' &&
            REJECT_ACK_LINES.has(next.content.trim())) {
            excludedIds.add(next.id);
        }
    }
    return messages.filter((m) => m.kind !== 'notice' &&
        m.kind !== 'revision_ready' &&
        !excludedIds.has(m.id));
}
const MAX_DOCUMENT_EXCERPT = 16000;
const MAX_CHAPTER_CONTENT = 3000;
const MIN_OTHER_CHAPTER_CHARS = 400;
export const WRITING_CHAPTER_ONLY_SCOPE_NOTE = '（用户要求仅根据本章理解，已省略其它章节正文）';
export const WRITING_FULL_ARTICLE_BLOCK_PREFIX = '整篇文章按章列出（供理解；评价与改稿仍只针对「当前待改章节」）：';
const FOLDED_CHAPTER_NOTE = '（此章较长，已折叠；如需针对它改稿请切换到该章）';
/**
 * 按 order 格式化每一章，当前章在全文 excerpt 中标注。
 *
 * 修 A3：超过 MAX_DOCUMENT_EXCERPT 后，尾章不再整章静默丢弃，而是降级为「标题占位」，
 * 保证每一章的标题都出现在上下文里；被折叠章节的正文通过可选的 `foldedOut` 收集返回，
 * 供上层触发全篇摘要兜底（R-NoSilentLoss）。当前待改章永远优先保留正文。
 */
export function formatArticleChaptersForLlm(doc, activeChapterId, foldedOut) {
    const chapters = [...doc.chapters].sort((a, b) => a.order - b.order);
    if (chapters.length === 0)
        return '';
    const parts = [];
    let totalLen = 0;
    let overflowed = false;
    for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        const isActive = ch.id === activeChapterId;
        const text = ch.blocks
            .map((b) => b.content.trim())
            .filter(Boolean)
            .join('\n') || '（本章暂无正文）';
        const header = isActive
            ? `【第${i + 1}章 · ${ch.title}】（当前待改章节）`
            : `【第${i + 1}章 · ${ch.title}】`;
        let body = text;
        if (!isActive && text.length > MIN_OTHER_CHAPTER_CHARS * 3) {
            body = `${text.slice(0, MIN_OTHER_CHAPTER_CHARS * 3)}\n…（以下省略）`;
        }
        const segment = `${header}\n${body}`;
        if (!overflowed && totalLen + segment.length <= MAX_DOCUMENT_EXCERPT) {
            parts.push(segment);
            totalLen += segment.length + 2;
            continue;
        }
        // 预算已满：当前待改章仍尽量保正文，其它章降级为标题占位（不再整章消失）
        overflowed = true;
        if (isActive) {
            const room = Math.max(500, MAX_DOCUMENT_EXCERPT - totalLen - header.length - 2);
            parts.push(`${header}\n${text.slice(0, room)}`);
            totalLen += header.length + Math.min(room, text.length) + 2;
        }
        else {
            const placeholder = `${header}\n${FOLDED_CHAPTER_NOTE}`;
            parts.push(placeholder);
            totalLen += placeholder.length + 2;
            foldedOut?.push(`${header}\n${text}`);
        }
    }
    return parts.join('\n\n');
}
export function buildWritingChapterBlock(chapterTitle, chapterContent) {
    const content = chapterContent.trim() || '（本章尚无正文）';
    return chapterTitle.trim()
        ? `当前待改章节：${chapterTitle.trim()}\n本章内容：\n${content}`
        : `本章内容：\n${content}`;
}
export function buildWritingDocumentBlock(documentExcerpt) {
    const excerpt = documentExcerpt.trim();
    if (!excerpt)
        return '';
    return `${WRITING_FULL_ARTICLE_BLOCK_PREFIX}\n${excerpt}`;
}
/** API / 移动端统一：当前章 block + 全篇按章 block */
export function buildWritingAssistantContextBlocks(input) {
    const chapterBlock = buildWritingChapterBlock(input.chapterTitle, input.chapterContent);
    if (input.referenceScope === 'chapter') {
        return { chapterBlock, documentBlock: '' };
    }
    return {
        chapterBlock,
        documentBlock: buildWritingDocumentBlock(input.documentExcerpt),
    };
}
/** 写作小助手：待改章节 + 全篇按章（供 LLM 理解，改稿仍只改一章） */
export function buildWritingAssistantChapterContext(doc, chapterId, chapterDraft) {
    const chapters = [...doc.chapters].sort((a, b) => a.order - b.order);
    const active = chapters.find((c) => c.id === chapterId);
    const chapterTitle = active?.title ?? '当前章节';
    const persisted = active?.blocks[0]?.content ?? '';
    const chapterContent = (chapterDraft ?? persisted).trim().slice(0, MAX_CHAPTER_CONTENT);
    const documentExcerpt = formatArticleChaptersForLlm(doc, chapterId);
    return {
        chapterId,
        chapterTitle,
        chapterContent,
        documentExcerpt,
        hasMultipleChapters: chapters.length > 1,
    };
}
//# sourceMappingURL=writingAssistantContext.js.map