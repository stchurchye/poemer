import type { Revision, WritingUnderstandingScope } from '@shiren/shared';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { WritingStackParamList } from '../navigation/types';
import type { SuggestionViewOnlyReason } from './suggestionViewOnly';

export type OpenDiffPreviewOptions = {
  comment?: string;
  /** 优先于 revision 内字段，避免列表/缓存里 snapshot 缺失 */
  oldText?: string;
  newText?: string;
  retryAction?: string;
  retryInstruction?: string;
  feedbackHistory?: string[];
  suggestAction?: string;
  suggestUnderstandingScope?: WritingUnderstandingScope;
  suggestEvaluation?: string;
  suggestRationale?: string;
  /** 仅查看对比，不可采纳/再改 */
  viewOnly?: boolean;
  viewOnlyReason?: SuggestionViewOnlyReason;
};

export type DiffPreviewParams = WritingStackParamList['DiffPreview'];

export function buildDiffPreviewParams(
  documentId: string,
  rev: Revision,
  options?: OpenDiffPreviewOptions,
): DiffPreviewParams {
  return {
    documentId,
    revisionId: rev.id,
    blockId: rev.blockId ?? '',
    oldText: options?.oldText ?? rev.previousSnapshot ?? '',
    newText: options?.newText ?? rev.snapshot ?? '',
    comment: options?.comment ?? rev.summary,
    createdAt: rev.createdAt,
    retryAction: options?.retryAction ?? rev.suggestAction ?? '润色',
    retryInstruction: options?.retryInstruction ?? rev.suggestInstruction ?? '',
    feedbackHistory: options?.feedbackHistory ?? [],
    suggestAction: options?.suggestAction ?? rev.suggestAction,
    suggestUnderstandingScope:
      options?.suggestUnderstandingScope ?? rev.suggestUnderstandingScope,
    suggestEvaluation: options?.suggestEvaluation ?? rev.suggestEvaluation,
    suggestRationale: options?.suggestRationale ?? rev.suggestRationale,
    viewOnly: options?.viewOnly,
    viewOnlyReason: options?.viewOnlyReason,
  };
}

/** 等待小助手 Modal 从原生层卸载（避免挡住导航后的页面与返回） */
export function waitForAssistantModalDismiss(ms = 360): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 打开或刷新「看一看」；已在 DiffPreview 时用 replace 避免重复 navigate 无反应 */
export function openDiffPreview(
  navigation: NativeStackNavigationProp<WritingStackParamList>,
  documentId: string,
  rev: Revision,
  options?: OpenDiffPreviewOptions,
) {
  const params = buildDiffPreviewParams(documentId, rev, options);
  const routes = navigation.getState().routes;
  const top = routes[routes.length - 1];
  if (top?.name === 'DiffPreview') {
    navigation.replace('DiffPreview', params);
    return;
  }
  navigation.navigate('DiffPreview', params);
}

/** 返回写作页（比 goBack 更可靠，避免栈里多层 DiffPreview） */
export function leaveDiffPreview(
  navigation: NativeStackNavigationProp<WritingStackParamList>,
  documentId: string,
) {
  navigation.navigate('WritingMain', { documentId });
}
