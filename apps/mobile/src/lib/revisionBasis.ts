import type {
  Revision,
  WritingAssistantMessage,
  WritingUnderstandingScope,
} from '@shiren/shared';
import { zh } from '../locales/zh-CN';

export type RevisionBasisDisplay = {
  evaluation?: string;
  rationale?: string;
  action?: string;
  scopeLabel?: string;
};

export function scopeLabelForUnderstanding(
  scope?: WritingUnderstandingScope,
): string | undefined {
  if (scope === 'chapter') return zh.diff.basisScopeChapter;
  if (scope === 'document') return zh.diff.basisScopeDocument;
  return undefined;
}

export function revisionBasisFromFields(input: {
  suggestEvaluation?: string;
  suggestRationale?: string;
  suggestAction?: string;
  suggestUnderstandingScope?: WritingUnderstandingScope;
}): RevisionBasisDisplay | null {
  const evaluation = input.suggestEvaluation?.trim();
  const rationale = input.suggestRationale?.trim();
  const action = input.suggestAction?.trim();
  const scopeLabel = scopeLabelForUnderstanding(input.suggestUnderstandingScope);
  if (!evaluation && !rationale && !action && !scopeLabel) return null;
  return {
    evaluation: evaluation || undefined,
    rationale: rationale || undefined,
    action: action || undefined,
    scopeLabel,
  };
}

/** 刷新列表时保留本地已有的改稿依据字段 */
export function mergeRevisionLists(server: Revision[], local: Revision[]): Revision[] {
  const localById = new Map(local.map((r) => [r.id, r]));
  return server.map((s) => {
    const prev = localById.get(s.id);
    if (!prev) return s;
    return {
      ...s,
      suggestEvaluation: s.suggestEvaluation ?? prev.suggestEvaluation,
      suggestRationale: s.suggestRationale ?? prev.suggestRationale,
      suggestAction: s.suggestAction ?? prev.suggestAction,
      suggestUnderstandingScope:
        s.suggestUnderstandingScope ?? prev.suggestUnderstandingScope,
    };
  });
}

export function revisionBasisFromRevision(rev: Revision): RevisionBasisDisplay | null {
  return revisionBasisFromFields({
    suggestEvaluation: rev.suggestEvaluation,
    suggestRationale: rev.suggestRationale,
    suggestAction: rev.suggestAction,
    suggestUnderstandingScope: rev.suggestUnderstandingScope,
  });
}

export function hasRevisionBasis(basis: RevisionBasisDisplay | null): boolean {
  return Boolean(
    basis?.evaluation || basis?.rationale || basis?.action || basis?.scopeLabel,
  );
}

/** 旧 revision 无 LLM 评价时无法回填（需重新改稿） */
export function inferRevisionBasisFromMessages(
  _messages: WritingAssistantMessage[],
  _revisionId: string,
): RevisionBasisDisplay | null {
  return null;
}
