export type WritingMode = '自动' | '长文写作' | '文笔优化' | '识图识字';

export type RevisionSource = 'ai' | 'user' | 'ocr' | 'rollback';
export type RevisionStatus = 'pending' | 'accepted' | 'rejected';

export type WritingAction = '续写' | '润色' | '扩写' | '缩写' | '改语气';

export interface Block {
  id: string;
  content: string;
  currentRevisionId: string | null;
}

export interface Chapter {
  id: string;
  title: string;
  order: number;
  blocks: Block[];
  chapterSummary: string;
}

export interface Document {
  id: string;
  title: string;
  chapters: Chapter[];
  globalSummary: string;
  styleGuide: string;
  currentRevisionId: string | null;
  revisionCount: number;
  updatedAt: string;
  createdAt: string;
  /** 有值表示已从写作页隐藏，可在「我的」里复原 */
  hiddenAt?: string | null;
  writingContextSummary?: string | null;
  writingContextSummaryUpToMessageId?: string | null;
  documentContextSummary?: string | null;
  /** 设定卡：人物/称呼/时间线/风格常驻记忆，写作时常驻注入、不参与压缩 */
  storyBible?: StoryBible | null;
}

/** 设定卡条目分类 */
export type StoryBibleCategory = 'character' | 'term' | 'timeline' | 'style';

export interface StoryBibleEntry {
  id: string;
  category: StoryBibleCategory;
  /** 简称/词条，如「大姐」「阿珍」 */
  label: string;
  /** 说明，如「大女儿，1955 年生；正文里称『大姐』」 */
  note: string;
}

export interface StoryBible {
  entries: StoryBibleEntry[];
  /** 最近一次自动抽取的时间（ISO 字符串） */
  updatedAt?: string;
}

export interface Revision {
  id: string;
  documentId: string;
  blockId: string | null;
  parentRevisionId: string | null;
  snapshot: string;
  previousSnapshot: string | null;
  summary: string;
  source: RevisionSource;
  status: RevisionStatus;
  createdAt: string;
  timezone: string;
  /** 看一看展示的改稿依据（生成时写入，不再调 LLM） */
  suggestAction?: string;
  suggestInstruction?: string;
  suggestUnderstandingScope?: WritingUnderstandingScope;
  /** @deprecated 意图确认话术，改稿依据请用 suggestEvaluation / suggestRationale */
  suggestIntentSummary?: string;
  /** 改稿时模型对原文的评价 */
  suggestEvaluation?: string;
  /** 改稿时模型说明的修改理由 */
  suggestRationale?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  contextSummary?: string | null;
  contextSummaryUpToMessageId?: string | null;
  /** 该话题最近一条用户提问（列表展示用） */
  lastQuestion?: string | null;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  /** 仅 UI 展示用本地路径，不进入后续 LLM 上下文 */
  imagePreviewUris?: string[];
}

import type { AssistantGuideKey } from './prompts/assistantGuideRegistry.js';
export type { AssistantGuideKey };

/** 小助手发送前意图整理（确认后再正式问答） */
export interface ChatIntentAnalyzeResult {
  displayText: string;
  sendContent: string;
  ready: boolean;
  transcript?: string;
  source: 'text' | 'voice';
  guide?: AssistantGuideKey;
}

export type WritingAssistantIntentMode = 'chat' | 'revise' | 'guide';

export type WritingUnderstandingScope = 'chapter' | 'document';

/** 写作小助手发送前意图整理（确认后再落库 / 改稿） */
export interface WritingIntentAnalyzeResult {
  mode: WritingAssistantIntentMode;
  /** 理解范围：仅本章 / 可参考全篇各章 */
  referenceScope?: WritingUnderstandingScope;
  displayText: string;
  action: string;
  instruction: string;
  ready: boolean;
  transcript?: string;
  source: 'text' | 'voice';
  /** mode=chat 时助手回复正文 */
  chatReply?: string;
  user?: WritingAssistantMessage;
  assistant?: WritingAssistantMessage;
  /** 产品操作引导 */
  guide?: AssistantGuideKey;
}

/** 写作页右侧小助手对话（按文稿隔离） */
export type WritingAssistantMessageKind =
  | 'chat'
  | 'intent_confirm'
  | 'notice'
  | 'revision_ready';

export type WritingAssistantConfirmStatus = 'pending' | 'approved' | 'rejected';

export interface WritingAssistantMessage {
  id: string;
  documentId: string;
  role: 'user' | 'assistant';
  content: string;
  kind: WritingAssistantMessageKind;
  /** 待用户确认后执行的改稿动作 */
  pendingAction?: string;
  pendingInstruction?: string;
  confirmStatus?: WritingAssistantConfirmStatus;
  /** 对应待查看的改稿 revision */
  revisionId?: string;
  /** 改稿完成时写入，供对话气泡展示改稿依据 */
  suggestEvaluation?: string;
  suggestRationale?: string;
  suggestAction?: string;
  suggestUnderstandingScope?: WritingUnderstandingScope;
  createdAt: string;
}

export interface DiffSegment {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

export interface ApiErrorBody {
  ok: false;
  message: string;
  hint: string;
  code: string;
  requestId: string;
  retryable: boolean;
}

export interface ApiSuccessBody<T> {
  ok: true;
  data: T;
  requestId: string;
}
