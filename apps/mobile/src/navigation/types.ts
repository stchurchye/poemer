import type { NavigatorScreenParams } from '@react-navigation/native';
import type { WritingUnderstandingScope } from '@shiren/shared';

export type WritingStackParamList = {
  WritingMain: { documentId?: string; toast?: string } | undefined;
  DocumentLibrary: { currentDocumentId?: string } | undefined;
  DiffPreview: {
    documentId: string;
    revisionId: string;
    blockId: string;
    oldText: string;
    newText: string;
    comment?: string;
    createdAt: string;
    retryAction?: string;
    retryInstruction?: string;
    feedbackHistory?: string[];
    suggestAction?: string;
    suggestUnderstandingScope?: WritingUnderstandingScope;
    suggestEvaluation?: string;
    suggestRationale?: string;
    /** 仅查看对比，不可再次采纳或再改 */
    viewOnly?: boolean;
    viewOnlyReason?: 'decided' | 'manually_accepted' | 'superseded';
  };
  RevisionHistory: { documentId: string; title: string };
};

export type MeStackParamList = {
  MeMain: undefined;
  ApiKeys: undefined;
};

export type RootTabParamList = {
  WritingTab: NavigatorScreenParams<WritingStackParamList> | undefined;
  ChatTab: undefined;
  MeTab: undefined;
};
