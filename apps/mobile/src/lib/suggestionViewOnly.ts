import type { Revision } from '@shiren/shared';

export type SuggestionViewOnlyReason = 'decided' | 'manually_accepted' | 'superseded';

const MANUAL_EDIT_MARK = '采纳前您又改了几个字';

export function latestPendingRevisionForBlock(
  allRevisions: Revision[],
  blockId: string,
): Revision | undefined {
  return allRevisions
    .filter((r) => r.blockId === blockId && r.status === 'pending')
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
}

/** 改稿建议是否只能「看一看」、不可再采纳/再改 */
export function computeSuggestionViewOnly(
  rev: Revision,
  allRevisions: Revision[],
  blockId: string,
): { viewOnly: boolean; reason?: SuggestionViewOnlyReason } {
  if (rev.status !== 'pending') {
    return { viewOnly: true, reason: 'decided' };
  }

  if (rev.summary.includes(MANUAL_EDIT_MARK)) {
    return { viewOnly: true, reason: 'manually_accepted' };
  }

  const latestPending = latestPendingRevisionForBlock(allRevisions, blockId);
  if (latestPending && latestPending.id !== rev.id) {
    return { viewOnly: true, reason: 'superseded' };
  }

  return { viewOnly: false };
}

/** 助手气泡「看一看」：仅最新一条 pending 为可操作（棕色），其余为只读 */
export function isRevisionBubbleViewOnly(
  revisionId: string,
  allRevisions: Revision[],
  blockId: string,
): boolean {
  const latestPending = latestPendingRevisionForBlock(allRevisions, blockId);
  if (!latestPending || latestPending.id !== revisionId) {
    return true;
  }
  const rev = allRevisions.find((r) => r.id === revisionId);
  if (!rev) {
    return true;
  }
  return computeSuggestionViewOnly(rev, allRevisions, blockId).viewOnly;
}

/** 打开看一看页时的只读策略（含已被新建议顶替、但 revision 仍带 pending 的缓存） */
export function resolveSuggestionViewPolicy(
  rev: Revision,
  allRevisions: Revision[],
  blockId: string,
): { viewOnly: boolean; reason?: SuggestionViewOnlyReason } {
  const latestPending = latestPendingRevisionForBlock(allRevisions, blockId);
  if (latestPending && rev.id !== latestPending.id) {
    if (rev.status === 'pending') {
      return { viewOnly: true, reason: 'superseded' };
    }
    const decided = computeSuggestionViewOnly(rev, allRevisions, blockId);
    return { viewOnly: true, reason: decided.reason ?? 'decided' };
  }
  return computeSuggestionViewOnly(rev, allRevisions, blockId);
}

export function suggestionViewOnlyHint(reason?: SuggestionViewOnlyReason): string {
  switch (reason) {
    case 'manually_accepted':
      return '您采纳前改过建议正文，此处仅可查看对比';
    case 'superseded':
      return '已有新的改稿建议，此版仅可查看对比';
    case 'decided':
    default:
      return '您已作出选择，仍可查看增删对比';
  }
}
