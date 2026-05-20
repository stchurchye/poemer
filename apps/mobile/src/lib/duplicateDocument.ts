import type { Block, Chapter, Document } from '@shiren/shared';
import { api } from './api';

function newId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function cloneChapters(chapters: Chapter[]): Chapter[] {
  return [...chapters]
    .sort((a, b) => a.order - b.order)
    .map((ch, index) => ({
      id: newId(),
      title: ch.title,
      order: index,
      chapterSummary: ch.chapterSummary,
      blocks: ch.blocks.map(
        (b: Block): Block => ({
          id: newId(),
          content: b.content,
          currentRevisionId: null,
        }),
      ),
    }));
}

/** 复制文稿及全部章节正文为新文稿 */
export async function duplicateDocument(source: Document, title?: string): Promise<Document> {
  const copyTitle = title?.trim() || `${source.title} 副本`;
  const created = await api.createDocument(copyTitle);
  const chapters = cloneChapters(source.chapters);
  const res = await api.updateDocument(created.data.id, {
    chapters,
    globalSummary: source.globalSummary,
    styleGuide: source.styleGuide,
  });
  return res.data;
}
