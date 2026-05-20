import type { Revision, WritingUnderstandingScope } from '@shiren/shared';
import { api } from './api';
import { latestPendingRevisionForBlock } from './suggestionViewOnly';

export type SuggestionPreviewCache = {
  revisionId: string;
  oldText: string;
  newText: string;
  comment?: string;
  suggestAction?: string;
  suggestUnderstandingScope?: WritingUnderstandingScope;
  suggestEvaluation?: string;
  suggestRationale?: string;
};

function revisionFromPreview(
  preview: SuggestionPreviewCache,
  documentId: string,
  blockId: string,
): Revision {
  return {
    id: preview.revisionId,
    documentId,
    blockId,
    parentRevisionId: null,
    snapshot: preview.newText,
    previousSnapshot: preview.oldText,
    summary: preview.comment?.trim() || '',
    source: 'ai',
    status: 'pending',
    createdAt: new Date().toISOString(),
    timezone: 'Asia/Shanghai',
    suggestAction: preview.suggestAction,
    suggestUnderstandingScope: preview.suggestUnderstandingScope,
    suggestEvaluation: preview.suggestEvaluation,
    suggestRationale: preview.suggestRationale,
  };
}

/** 为「看一看」解析改稿：列表 → 单条接口 → 本地缓存 */
export async function resolveRevisionForView(params: {
  documentId: string;
  revisionId: string;
  blockId: string;
  list?: Revision[];
  hint?: Revision | null;
  suggestionRevision?: Revision | null;
  suggestionPreview?: SuggestionPreviewCache | null;
}): Promise<{ revision: Revision | null; allRevisions: Revision[] }> {
  const {
    documentId,
    revisionId,
    blockId,
    hint,
    suggestionRevision,
    suggestionPreview,
  } = params;

  if (hint?.id === revisionId) {
    const allRevisions = params.list ?? (await api.listRevisions(documentId)).data;
    return { revision: hint, allRevisions };
  }

  let allRevisions = params.list;
  if (!allRevisions) {
    try {
      allRevisions = (await api.listRevisions(documentId)).data;
    } catch {
      allRevisions = [];
    }
  }

  const fromList = allRevisions.find((r) => r.id === revisionId);
  if (fromList) return { revision: fromList, allRevisions };

  try {
    const one = await api.getRevision(documentId, revisionId);
    return { revision: one.data, allRevisions };
  } catch {
    // 列表未含已拒绝等条目时，单条接口也可能 404
  }

  if (suggestionRevision?.id === revisionId) {
    return { revision: suggestionRevision, allRevisions };
  }

  if (
    suggestionPreview?.revisionId === revisionId &&
    (suggestionPreview.newText.trim() || suggestionPreview.oldText.trim())
  ) {
    const previewRev = revisionFromPreview(suggestionPreview, documentId, blockId);
    const serverRev = allRevisions.find((r) => r.id === revisionId);
    if (serverRev) {
      return { revision: serverRev, allRevisions };
    }
    const latestPending = latestPendingRevisionForBlock(allRevisions, blockId);
    if (latestPending && latestPending.id !== revisionId) {
      return {
        revision: { ...previewRev, status: 'rejected' },
        allRevisions,
      };
    }
    return { revision: previewRev, allRevisions };
  }

  return { revision: null, allRevisions };
}
