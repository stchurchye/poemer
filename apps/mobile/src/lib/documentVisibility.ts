import type { Document } from '@shiren/shared';

export function isDocumentHidden(doc: Pick<Document, 'hiddenAt'>): boolean {
  return Boolean(doc.hiddenAt);
}

export function filterVisibleDocuments(docs: Document[]): Document[] {
  return docs.filter((d) => !isDocumentHidden(d));
}
