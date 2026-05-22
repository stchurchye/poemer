import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import type { TextInput } from 'react-native';
import {
  assistantWorkingLine,
  type ContextSelection,
  type ContextUsage,
  type Revision,
  type AssistantGuideKey,
  type WritingAssistantMessage,
  type WritingUnderstandingScope,
} from '@shiren/shared';
import { appAlert, appAlertOverModal } from '../lib/appAlert';
import { api } from '../lib/api';
import {
  getAssistantContinueLine,
  getAssistantIntentAnalyzingLine,
  getAssistantThinkingLine,
  getAssistantThinkingLongLine,
  buildWritingRevisionReadySpeakText,
} from '../lib/assistantCopy';
import {
  announceAssistantReplySync,
  announceAssistantSpeak,
  announceAssistantWaiting,
  cancelAssistantFeedback,
} from '../lib/assistantFeedback';
import { apiErrorText, apiLoadErrorText } from '../lib/apiError';
import { ReconnectBanner } from './ReconnectBanner';
import { useListAutoScroll } from '../hooks/useListAutoScroll';
import { animateTypewriter } from '../lib/typewriter';
import { isSpeaking, speakText, stopReadAloud, stopSpeaking } from '../lib/tts';
import {
  collectWritingAssistantRepliesFromScreen,
  writingBubbleText,
  type WritingUiMessage,
} from '../lib/uiMessage';
import { CopyableMessageBubble } from './CopyableMessageBubble';
import { AssistantComposeDock } from './AssistantComposeDock';
import { ContextComposerModal } from './ContextComposerModal';
import { AssistantLoadingRow, LoadingLabel } from './AssistantLoadingRow';
import { MessageRichText } from './MessageRichText';
import { AssistantGuidePromptBlock } from './AssistantGuidePromptBlock';
import { ContextHubSheet } from './ContextHubSheet';
import { ContextUsageDetailModal } from './ContextUsageDetailModal';
import type { AssistantHeaderContext, AssistantHeaderReadAloud } from './WritingAssistantSheet';
import { colors } from '../theme/colors';
import { chatMessageStyles } from '../theme/chatMessage';
import { useTypography } from '../theme/layout';
import { RevisionBasisBlock } from './RevisionBasisBlock';
import {
  mergeRevisionLists,
  revisionBasisFromFields,
  revisionBasisFromRevision,
} from '../lib/revisionBasis';
import { isRevisionBubbleViewOnly } from '../lib/suggestionViewOnly';
import type { AssistantGuideNav } from '../lib/assistantGuide';
import { zh } from '../locales/zh-CN';

function isTransientWorkingNotice(m: Pick<WritingAssistantMessage, 'kind' | 'content'>): boolean {
  if (m.kind !== 'notice') return false;
  const t = m.content.trim();
  return (
    t === assistantWorkingLine('mandarin') ||
    t === assistantWorkingLine('cantonese') ||
    t === assistantWorkingLine()
  );
}

/** 改稿完成时去掉已落库的等待 notice，避免与 revision_ready 叠两条 */
function dropRedundantWorkingNotices(
  messages: WritingAssistantMessage[],
  newOnes: WritingAssistantMessage[],
): WritingAssistantMessage[] {
  if (!newOnes.some((m) => m.kind === 'revision_ready')) return messages;
  return messages.filter((m) => !isTransientWorkingNotice(m));
}

function localMessage(
  documentId: string,
  role: WritingUiMessage['role'],
  content: string,
  kind: WritingUiMessage['kind'] = 'chat',
  extra?: Partial<WritingUiMessage>,
): WritingUiMessage {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    documentId,
    role,
    content,
    kind,
    createdAt: new Date().toISOString(),
    status: 'done',
    ...extra,
  };
}

export interface AiRevisionResult {
  revision: Revision;
  oldText: string;
  newText: string;
  comment: string;
  createdAt: string;
  retryAction?: string;
  retryInstruction?: string;
  suggestAction?: string;
  suggestUnderstandingScope?: WritingUnderstandingScope;
  suggestEvaluation?: string;
  suggestRationale?: string;
}

export interface WritingAssistantChapterPayload {
  chapterId: string;
  chapterTitle: string;
  chapterContent: string;
  documentExcerpt: string;
  hasMultipleChapters: boolean;
}

interface Props {
  documentId: string;
  blockId: string;
  articleExcerpt: string;
  chapterContext: WritingAssistantChapterPayload;
  disabled?: boolean;
  /** 打开该条改稿的「看一看」对比页（hint 为面板已缓存的 revision） */
  onViewRevision?: (revisionId: string, hint?: Revision) => void | Promise<void>;
  /** 浮层打开时滚到最新消息 */
  scrollToLatestOnOpen?: boolean;
  onBeforeExecute?: () => Promise<void>;
  onRevisionReady: (result: AiRevisionResult) => void;
  /** 嵌入右侧弹窗时隐藏顶部标题（由弹窗头部展示） */
  showTitle?: boolean;
  /** 弹窗打开后自动聚焦输入框并唤起键盘 */
  autoFocusCompose?: boolean;
  ocrBusy?: boolean;
  onStartOcr?: () => void;
  /** 将「开始朗读」挂到右侧浮层标题栏（仅 showTitle=false 时使用） */
  onHeaderReadAloud?: (config: AssistantHeaderReadAloud | null) => void;
  /** 将上下文占用挂到浮层标题栏（仅 showTitle=false 时使用） */
  onHeaderContext?: (config: AssistantHeaderContext | null) => void;
  /** 产品操作引导（设置 / 写作顶栏等） */
  guideNav?: AssistantGuideNav;
}

export function WritingAssistantPanel({
  documentId,
  blockId,
  articleExcerpt,
  chapterContext,
  disabled,
  onViewRevision,
  scrollToLatestOnOpen = false,
  onBeforeExecute,
  onRevisionReady,
  showTitle = true,
  autoFocusCompose = false,
  ocrBusy = false,
  onStartOcr,
  onHeaderReadAloud,
  onHeaderContext,
  guideNav,
}: Props) {
  const { bodyFontSize, bodyLineHeight, replyLineHeight, buttonFontSize, captionFontSize } =
    useTypography('dialog');
  const [messages, setMessages] = useState<WritingUiMessage[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [input, setInput] = useState('');
  const [inFlight, setInFlight] = useState(false);
  const [intentAnalyzing, setIntentAnalyzing] = useState(false);
  const [directChatLoading, setDirectChatLoading] = useState(false);
  const directChatBusyRef = useRef(false);
  const pendingGuideRef = useRef<{
    key: AssistantGuideKey;
    userText: string;
    userBubble: WritingUiMessage;
    referenceScope: WritingUnderstandingScope;
    source: 'text' | 'voice';
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorHint, setLoadErrorHint] = useState<string | undefined>();
  const [thinkingLine, setThinkingLine] = useState<string>(zh.writing.thinkingZh);
  const [thinkingLongLine, setThinkingLongLine] = useState<string>(zh.writing.thinkingLongZh);
  const [intentAnalyzingLine, setIntentAnalyzingLine] = useState<string>(
    zh.writing.intentAnalyzingZh,
  );
  const [speaking, setSpeaking] = useState(false);
  const [understandingScope, setUnderstandingScope] =
    useState<WritingUnderstandingScope>('chapter');
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
  const [contextUsageLoading, setContextUsageLoading] = useState(false);
  const [contextSelection, setContextSelection] = useState<ContextSelection | null>(null);
  const [contextDetailUsage, setContextDetailUsage] = useState<ContextUsage | null>(null);
  const [contextHubOpen, setContextHubOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const { listRef, onScroll, scrollToEnd, scrollToEndIfFollowing } = useListAutoScroll();
  const composeRef = useRef<TextInput>(null);
  const inFlightRef = useRef(false);
  const typewriterAbortRef = useRef<AbortController | null>(null);
  const visibleIndicesRef = useRef<number[]>([]);
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 15,
    minimumViewTime: 0,
  }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      visibleIndicesRef.current = viewableItems
        .filter((v) => v.isViewable && v.index != null)
        .map((v) => v.index as number);
    },
  ).current;

  useEffect(() => {
    if (!autoFocusCompose) return;
    const timer = setTimeout(() => composeRef.current?.focus(), 320);
    return () => clearTimeout(timer);
  }, [autoFocusCompose]);

  const refreshContextUsage = useCallback(
    async (pending?: string): Promise<ContextUsage | null> => {
      setContextUsageLoading(true);
      try {
        const res = await api.getWritingAssistantContextUsage(documentId, {
          chapterTitle: chapterContext.chapterTitle,
          chapterContent: chapterContext.chapterContent,
          documentExcerpt: chapterContext.documentExcerpt,
          pending,
          contextSelection: contextSelection ?? undefined,
        });
        setContextUsage(res.data);
        return res.data;
      } catch {
        setContextUsage(null);
        return null;
      } finally {
        setContextUsageLoading(false);
      }
    },
    [
      documentId,
      chapterContext.chapterTitle,
      chapterContext.chapterContent,
      chapterContext.documentExcerpt,
      contextSelection,
    ],
  );

  const refreshRevisions = useCallback(async () => {
    try {
      const res = await api.listRevisions(documentId);
      setRevisions((prev) => mergeRevisionLists(res.data, prev));
    } catch {
      // 保留上次列表，避免按钮状态闪灭
    }
  }, [documentId]);

  const loadMessages = useCallback(async () => {
    setLoadError(null);
    setLoadErrorHint(undefined);
    try {
      const res = await api.getWritingAssistantMessages(documentId);
      setMessages(res.data.map((m) => ({ ...m, status: 'done' as const })));
      scrollToEnd();
      void refreshContextUsage();
      void refreshRevisions();
    } catch (e) {
      const err = apiLoadErrorText(e);
      setLoadError(err.message);
      setLoadErrorHint(err.hint);
    }
  }, [documentId, scrollToEnd, refreshContextUsage, refreshRevisions]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages, documentId]);

  useEffect(() => {
    if (scrollToLatestOnOpen) {
      void refreshRevisions();
    }
  }, [scrollToLatestOnOpen, documentId, refreshRevisions]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshContextUsage(input);
    }, 300);
    return () => clearTimeout(timer);
  }, [
    documentId,
    input,
    chapterContext.chapterTitle,
    chapterContext.chapterContent,
    chapterContext.documentExcerpt,
    refreshContextUsage,
  ]);

  useEffect(() => {
    if (!scrollToLatestOnOpen || messages.length === 0) return;
    scrollToEnd(false);
    const t1 = setTimeout(() => scrollToEnd(false), 200);
    const t2 = setTimeout(() => scrollToEnd(false), 520);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [scrollToLatestOnOpen, messages.length, scrollToEnd]);

  const reloadWaitingCopy = useCallback(() => {
    void (async () => {
      setThinkingLine(await getAssistantThinkingLine());
      setThinkingLongLine(await getAssistantThinkingLongLine());
      setIntentAnalyzingLine(await getAssistantIntentAnalyzingLine());
    })();
  }, []);

  const hasPendingIntentConfirm = messages.some(
    (m) => m.kind === 'intent_confirm' && m.confirmStatus === 'pending',
  );

  useEffect(() => {
    reloadWaitingCopy();
  }, [documentId, reloadWaitingCopy]);

  useEffect(() => {
    if (autoFocusCompose) reloadWaitingCopy();
  }, [autoFocusCompose, reloadWaitingCopy]);

  useEffect(() => {
    return () => {
      typewriterAbortRef.current?.abort();
      void stopReadAloud();
    };
  }, []);

  const canReadReply = messages.some(
    (m) =>
      m.role === 'assistant' &&
      m.status !== 'pending' &&
      m.status !== 'streaming' &&
      m.status !== 'error' &&
      writingBubbleText(m).trim().length > 0,
  );

  const toggleReadAloud = useCallback(async () => {
    if (await isSpeaking()) {
      await stopSpeaking();
      setSpeaking(false);
      return;
    }

    const text = collectWritingAssistantRepliesFromScreen(messages, visibleIndicesRef.current);
    if (!text.trim()) {
      appAlert(
        '提示',
        visibleIndicesRef.current.length > 0 ? zh.chat.readEmptyVisible : zh.chat.readEmpty,
      );
      return;
    }

    void cancelAssistantFeedback();
    setSpeaking(true);
    try {
      await speakText(
        text,
        {
          onDone: () => setSpeaking(false),
          onStopped: () => setSpeaking(false),
          onError: () => setSpeaking(false),
        },
        { playbackKind: 'readAloud' },
      );
    } catch {
      setSpeaking(false);
    }
  }, [messages]);

  useEffect(() => {
    if (!onHeaderReadAloud || showTitle) return;
    onHeaderReadAloud({
      speaking,
      canRead: canReadReply,
      onToggle: () => void toggleReadAloud(),
    });
    return () => onHeaderReadAloud(null);
  }, [onHeaderReadAloud, showTitle, speaking, canReadReply, toggleReadAloud]);

  const openContextDetail = useCallback(async () => {
    if (contextUsage) {
      setContextDetailUsage(contextUsage);
      return;
    }
    const usage = await refreshContextUsage(input);
    if (usage) {
      setContextDetailUsage(usage);
      return;
    }
    setContextHubOpen(true);
  }, [contextUsage, refreshContextUsage, input]);

  useEffect(() => {
    if (!onHeaderContext || showTitle) {
      onHeaderContext?.(null);
      return;
    }
    onHeaderContext({
      ratio: contextUsage?.ratio ?? 0,
      loading: contextUsageLoading,
      onPress: () => void openContextDetail(),
      onLongPress: () => setContextHubOpen(true),
    });
    return () => onHeaderContext(null);
  }, [
    onHeaderContext,
    showTitle,
    contextUsage,
    contextUsageLoading,
    openContextDetail,
  ]);

  useEffect(() => {
    inFlightRef.current = inFlight;
  }, [inFlight]);

  useEffect(() => {
    if (!inFlight) return;
    const timer = setTimeout(() => {
      if (!inFlightRef.current) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.status === 'pending'
            ? { ...m, displayContent: thinkingLongLine }
            : m,
        ),
      );
      if (!inFlightRef.current) return;
      void announceAssistantWaiting(thinkingLongLine);
    }, 28_000);
    return () => clearTimeout(timer);
  }, [inFlight, thinkingLongLine]);

  const revealMessage = useCallback(
    async (messageId: string, fullText: string) => {
      typewriterAbortRef.current?.abort();
      const ac = new AbortController();
      typewriterAbortRef.current = ac;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, status: 'streaming', content: fullText, displayContent: '' }
            : m,
        ),
      );
      await animateTypewriter(
        fullText,
        (visible) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, displayContent: visible } : m)),
          );
          scrollToEndIfFollowing();
        },
        { signal: ac.signal },
      );
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, status: 'done', displayContent: undefined } : m,
        ),
      );
    },
    [scrollToEndIfFollowing],
  );

  const runWritingDirectChat = useCallback(
    async (
      trimmed: string,
      opts: {
        userBubble?: WritingUiMessage;
        referenceScope?: WritingUnderstandingScope;
        source?: 'text' | 'voice';
      } = {},
    ) => {
      const text = trimmed.trim();
      if (!text || disabled || directChatBusyRef.current) return;

      const assistantId = `local-asst-${Date.now()}`;
      const scope = opts.referenceScope ?? understandingScope;
      const source = opts.source ?? 'text';
      const linkedUser = opts.userBubble;
      const waitingLine = await getAssistantIntentAnalyzingLine();
      setIntentAnalyzingLine(waitingLine);

      directChatBusyRef.current = true;
      setDirectChatLoading(true);
      scrollToEnd();
      void announceAssistantWaiting(waitingLine);
      setInFlight(true);

      try {
        if (__DEV__) {
          console.log('[writing-direct-chat] request', { text: text.slice(0, 60), scope });
        }
        const chatRes = await api.analyzeWritingAssistantIntent(documentId, {
          content: text,
          articleExcerpt,
          chapterTitle: chapterContext.chapterTitle,
          chapterContent: chapterContext.chapterContent,
          documentExcerpt: chapterContext.documentExcerpt,
          contextSelection: contextSelection ?? undefined,
          source,
          directChat: true,
          referenceScope: scope,
        });
        if (chatRes.data.contextUsage) setContextUsage(chatRes.data.contextUsage);

        const fullText =
          chatRes.data.chatReply?.trim() ||
          chatRes.data.displayText?.trim() ||
          chatRes.data.assistant?.content?.trim() ||
          '';

        if (__DEV__) {
          console.log('[writing-direct-chat] ok', {
            chars: fullText.length,
            requestId: chatRes.requestId,
          });
        }

        if (!fullText) {
          appAlertOverModal(zh.writing.intentAnalyzeFailed);
          return;
        }

        const serverUser = chatRes.data.user;
        const serverAssistant = chatRes.data.assistant;

        setMessages((prev) => {
          const filtered = prev.filter(
            (m) => (!linkedUser || m.id !== linkedUser.id) && !m.localIntentUser,
          );
          const next: WritingUiMessage[] = [...filtered];
          if (serverUser) {
            next.push({ ...serverUser, status: 'done' });
          } else if (linkedUser) {
            next.push({ ...linkedUser, status: 'done', localIntentUser: undefined });
          }
          if (serverAssistant) {
            next.push({
              ...serverAssistant,
              id: assistantId,
              status: 'pending',
              content: fullText,
              displayContent: '',
            });
          } else {
            next.push(
              localMessage(documentId, 'assistant', fullText, 'chat', {
                id: assistantId,
                status: 'pending',
                displayContent: '',
                content: fullText,
              }),
            );
          }
          return next;
        });
        scrollToEnd();
        inFlightRef.current = false;
        await announceAssistantReplySync(fullText);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, status: 'streaming' as const, displayContent: '' }
              : m,
          ),
        );
        await revealMessage(assistantId, fullText);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...(serverAssistant ?? m),
                  id: serverAssistant?.id ?? assistantId,
                  status: 'done',
                  displayContent: undefined,
                  content: fullText,
                }
              : m,
          ),
        );
        scrollToEnd();
      } catch (e) {
        if (__DEV__) {
          console.warn('[writing-direct-chat] failed', e);
        }
        const { message, hint } = apiErrorText(e);
        appAlertOverModal(message, hint ? `${message}\n\n${hint}` : undefined);
      } finally {
        directChatBusyRef.current = false;
        setDirectChatLoading(false);
        setInFlight(false);
      }
    },
    [
      documentId,
      articleExcerpt,
      chapterContext,
      contextSelection,
      disabled,
      understandingScope,
      scrollToEnd,
    ],
  );

  const triggerGuideJustAsk = useCallback(() => {
    if (directChatBusyRef.current || directChatLoading) return;
    const ctx = pendingGuideRef.current;
    if (!ctx) return;
    void runWritingDirectChat(ctx.userText, {
      userBubble: ctx.userBubble,
      referenceScope: ctx.referenceScope,
      source: ctx.source,
    });
  }, [runWritingDirectChat, directChatLoading]);

  const applyWritingChatIntentResult = useCallback(
    async (
      res: Awaited<ReturnType<typeof api.analyzeWritingAssistantIntent>>,
      userBubble: WritingUiMessage,
    ) => {
      const serverUser = res.data.user;
      const serverAssistant = res.data.assistant;
      const reply =
        res.data.chatReply?.trim() ||
        res.data.displayText?.trim() ||
        serverAssistant?.content?.trim() ||
        '';
      const assistantId = serverAssistant?.id ?? `local-asst-${Date.now()}`;

      setMessages((prev) => {
        const withoutLocal = prev.filter(
          (m) => m.id !== userBubble.id && !m.localIntentUser,
        );
        const next = [...withoutLocal];
        if (serverUser) {
          next.push({ ...serverUser, status: 'done' as const });
        } else {
          next.push({ ...userBubble, status: 'done' as const, localIntentUser: undefined });
        }
        if (reply) {
          if (serverAssistant) {
            next.push({
              ...serverAssistant,
              id: assistantId,
              status: 'pending' as const,
              content: reply,
              displayContent: '',
            });
          } else {
            next.push(
              localMessage(documentId, 'assistant', reply, 'chat', {
                id: assistantId,
                status: 'pending',
                displayContent: '',
                content: reply,
              }),
            );
          }
        }
        return next;
      });
      scrollToEnd();
      if (!reply) return;

      await cancelAssistantFeedback();
      await announceAssistantReplySync(reply);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, status: 'streaming' as const, displayContent: '' }
            : m,
        ),
      );
      await revealMessage(assistantId, reply);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...(serverAssistant ?? m),
                id: serverAssistant?.id ?? assistantId,
                status: 'done',
                displayContent: undefined,
                content: reply,
              }
            : m,
        ),
      );
      scrollToEnd();
    },
    [documentId, scrollToEnd, revealMessage],
  );

  const requestSend = useCallback(
    async (text: string, _source: 'text' | 'voice') => {
      const trimmed = text.trim();
      if (!trimmed || inFlight || intentAnalyzing || disabled || hasPendingIntentConfirm) return;

      if (_source === 'text') setInput('');
      const userBubble = localMessage(documentId, 'user', trimmed, 'chat', {
        localIntentUser: true,
      });
      setMessages((prev) => [
        ...prev.filter(
          (m) =>
            !(
              m.id.startsWith('local-') &&
              (m.kind === 'intent_confirm' || m.localIntentUser)
            ),
        ),
        userBubble,
      ]);
      scrollToEnd();

      const analyzingLine = await getAssistantIntentAnalyzingLine();
      setIntentAnalyzingLine(analyzingLine);
      setIntentAnalyzing(true);
      void announceAssistantWaiting(analyzingLine);
      let pendingGuideKey: AssistantGuideKey | null = null;
      try {
        const res = await api.analyzeWritingAssistantIntent(documentId, {
          content: trimmed,
          articleExcerpt,
          chapterTitle: chapterContext.chapterTitle,
          chapterContent: chapterContext.chapterContent,
          documentExcerpt: chapterContext.documentExcerpt,
          contextSelection: contextSelection ?? undefined,
          source: _source,
        });
        if (res.data.contextUsage) setContextUsage(res.data.contextUsage);

        if (__DEV__) {
          console.log('[writing-intent]', {
            mode: res.data.mode,
            guide: res.data.guide,
            ready: res.data.ready,
            displayText: res.data.displayText?.slice(0, 80),
            requestId: res.requestId,
          });
        }

        const referenceScope =
          res.data.referenceScope === 'chapter' ? 'chapter' : 'document';
        setUnderstandingScope(referenceScope);

        const mode = res.data.mode ?? (res.data.ready ? 'revise' : 'chat');
        if (res.data.guide) {
          pendingGuideKey = res.data.guide;
          const guideScope = referenceScope;
          pendingGuideRef.current = {
            key: res.data.guide,
            userText: trimmed,
            userBubble,
            referenceScope: guideScope,
            source: _source,
          };
        } else if (mode === 'chat') {
          await applyWritingChatIntentResult(res, userBubble);
        } else if (mode === 'revise' && !res.data.ready) {
          const clarify = res.data.displayText.trim();
          setMessages((prev) => [
            ...prev,
            localMessage(documentId, 'assistant', clarify || trimmed, 'chat', {
              status: 'done',
            }),
          ]);
          scrollToEnd();
          if (clarify) {
            void cancelAssistantFeedback().then(() => {
              announceAssistantSpeak(clarify);
            });
          }
        } else {
          const action = res.data.action?.trim() || '润色';
          const instruction = res.data.instruction?.trim() || trimmed;
          const intentBubble = localMessage(
            documentId,
            'assistant',
            res.data.displayText.trim(),
            'intent_confirm',
            {
              pendingAction: action,
              pendingInstruction: instruction,
              confirmStatus: 'pending',
              pendingUserText: trimmed,
              linkedUserMessageId: userBubble.id,
              pendingReferenceScope: referenceScope,
            },
          );
          setMessages((prev) => [...prev, intentBubble]);
          scrollToEnd();
          const intentLine = res.data.displayText.trim();
          if (intentLine) {
            void cancelAssistantFeedback().then(() => {
              announceAssistantSpeak(intentLine);
            });
          }
        }
      } catch (e) {
        const { message, hint } = apiErrorText(e);
        if (_source === 'text') setInput(trimmed);
        if (__DEV__) {
          console.warn('[writing-intent] failed', e);
        }
        appAlertOverModal(
          zh.writing.intentAnalyzeFailed,
          hint ? `${message}\n\n${hint}` : message,
        );
      } finally {
        setIntentAnalyzing(false);
      }
      if (pendingGuideKey) {
        const guideKey = pendingGuideKey;
        const guideScope =
          pendingGuideRef.current?.referenceScope ?? understandingScope;
        const copy = zh.guide[guideKey];
        setMessages((prev) => [
          ...prev,
          localMessage(
            documentId,
            'assistant',
            `${copy.title}\n\n${copy.message}`,
            'notice',
            {
              guidePrompt: {
                key: guideKey,
                userText: trimmed,
                linkedUserBubbleId: userBubble.id,
                referenceScope: guideScope,
                source: _source,
              },
            },
          ),
        ]);
        scrollToEnd();
      }
    },
    [
      documentId,
      articleExcerpt,
      chapterContext,
      contextSelection,
      disabled,
      inFlight,
      intentAnalyzing,
      hasPendingIntentConfirm,
      scrollToEnd,
      guideNav,
      understandingScope,
      applyWritingChatIntentResult,
      runWritingDirectChat,
      triggerGuideJustAsk,
    ],
  );

  const send = () => void requestSend(input, 'text');

  const confirmIntent = async (
    messageId: string,
    approved: boolean,
    scope: WritingUnderstandingScope = understandingScope,
  ) => {
    if (inFlight || disabled || !approved) return;

    const intentMessage = messages.find((m) => m.id === messageId);
    const pendingId = `local-pending-${Date.now()}`;
    const beforeIds = new Set(messages.map((m) => m.id));

    const waitingLine = await getAssistantContinueLine();
    setMessages((prev) => [
      ...prev.map((m) =>
        m.id === messageId ? { ...m, confirmStatus: 'approved' as const } : m,
      ),
      localMessage(documentId, 'assistant', '', 'notice', {
        id: pendingId,
        status: 'pending',
        displayContent: waitingLine,
        retryConfirm: { messageId, approved, understandingScope: scope },
      }),
    ]);
    scrollToEnd();
    void announceAssistantWaiting(waitingLine);
    setInFlight(true);

    try {
      await onBeforeExecute?.();
      const res = await api.confirmWritingAssistant(documentId, {
        messageId,
        approved,
        blockId,
        articleExcerpt,
        chapterId: chapterContext.chapterId,
        chapterTitle: chapterContext.chapterTitle,
        chapterContent: chapterContext.chapterContent,
        documentExcerpt: chapterContext.documentExcerpt,
        understandingScope: scope,
      });

      if (res.data.revision) {
        const created = res.data.revision;
        setRevisions((prev) => {
          const rest = prev.filter((r) => r.id !== created.id);
          return [created, ...rest];
        });
      }

      inFlightRef.current = false;
      await cancelAssistantFeedback();

      const fresh = await api.getWritingAssistantMessages(documentId);
      const newOnes = fresh.data.filter((m) => !beforeIds.has(m.id));
      const displayMessages = dropRedundantWorkingNotices(fresh.data, newOnes);

      setMessages(
        displayMessages.map((m) => {
          const isNew = newOnes.some((n) => n.id === m.id);
          return isNew
            ? { ...m, status: 'streaming' as const, displayContent: '', content: m.content }
            : { ...m, status: 'done' as const };
        }),
      );
      scrollToEnd();

      const revisionReadyMsg = newOnes.find((m) => m.kind === 'revision_ready');

      for (const m of newOnes) {
        if (m.role !== 'assistant' || !m.content.trim()) continue;
        if (m.kind === 'notice' || m.kind === 'revision_ready') continue;
        await announceAssistantReplySync(m.content);
        await revealMessage(m.id, m.content);
      }

      if (revisionReadyMsg?.content.trim()) {
        const readyBasis = revisionBasisFromFields({
          suggestEvaluation:
            revisionReadyMsg.suggestEvaluation ?? res.data.revision?.suggestEvaluation,
          suggestRationale:
            revisionReadyMsg.suggestRationale ?? res.data.revision?.suggestRationale,
          suggestAction: revisionReadyMsg.suggestAction ?? res.data.revision?.suggestAction,
          suggestUnderstandingScope:
            revisionReadyMsg.suggestUnderstandingScope ??
            res.data.revision?.suggestUnderstandingScope,
        });
        const revisionSpeak = await buildWritingRevisionReadySpeakText(
          revisionReadyMsg.content,
          readyBasis,
        );
        if (revisionSpeak) {
          await announceAssistantReplySync(revisionSpeak);
        }
        await revealMessage(revisionReadyMsg.id, revisionReadyMsg.content);
      }

      if (res.data.contextUsage) {
        setContextUsage(res.data.contextUsage);
      }

      if (res.data.revision) {
        const created = res.data.revision;
        const newText = (
          res.data.newText ??
          created.snapshot ??
          ''
        ).trim();
        const oldTextResolved = res.data.oldText ?? created.previousSnapshot ?? '';
        const intentIdx = messages.findIndex((m) => m.id === messageId);
        const lastUserBeforeIntent =
          intentIdx > 0
            ? [...messages.slice(0, intentIdx)].reverse().find((m) => m.role === 'user')
            : undefined;
        const baseParts = [
          lastUserBeforeIntent?.content?.trim(),
          intentMessage?.pendingInstruction?.trim(),
        ].filter(Boolean);
        onRevisionReady({
          revision: created,
          oldText: oldTextResolved,
          newText,
          comment: res.data.comment ?? '',
          createdAt: created.createdAt,
          retryAction: intentMessage?.pendingAction ?? '润色',
          retryInstruction: baseParts.join('\n'),
          suggestAction: created.suggestAction ?? intentMessage?.pendingAction ?? '润色',
          suggestUnderstandingScope: created.suggestUnderstandingScope ?? scope,
          suggestEvaluation: created.suggestEvaluation,
          suggestRationale: created.suggestRationale,
        });
      }
      void refreshRevisions();
      scrollToEnd();
    } catch (e) {
      const err = e as Error & { code?: string; hint?: string };
      if (
        err.code === 'NOT_FOUND' ||
        err.code === 'ASSISTANT_INTENT_NOT_FOUND' ||
        err.code === 'BLOCK_NOT_FOUND' ||
        err.code === 'REVISION_NOT_FOUND'
      ) {
        await loadMessages();
      }
      const { message, hint } = apiErrorText(e);
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== pendingId)
          .concat(
            localMessage(documentId, 'assistant', hint ? `${message}\n\n${hint}` : message, 'notice', {
              status: 'error',
              retryConfirm: { messageId, approved, understandingScope: scope },
            }),
          ),
      );
      scrollToEnd();
    } finally {
      setInFlight(false);
    }
  };

  const rejectIntent = async (messageId: string) => {
    if (inFlight || disabled || intentAnalyzing) return;
    const intentMsg = messages.find((m) => m.id === messageId);
    if (
      !intentMsg ||
      intentMsg.kind !== 'intent_confirm' ||
      intentMsg.confirmStatus !== 'pending'
    ) {
      return;
    }

    if (messageId.startsWith('local-')) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, confirmStatus: 'rejected' as const } : m,
        ),
      );
      return;
    }

    try {
      const res = await api.confirmWritingAssistant(documentId, {
        messageId,
        approved: false,
        blockId,
        articleExcerpt,
        chapterId: chapterContext.chapterId,
        chapterTitle: chapterContext.chapterTitle,
        chapterContent: chapterContext.chapterContent,
        documentExcerpt: chapterContext.documentExcerpt,
        understandingScope,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, ...res.data.assistant, status: 'done' as const } : m,
        ),
      );
    } catch (e) {
      const { message, hint } = apiErrorText(e);
      appAlert(message, hint ? `${message}\n\n${hint}` : message);
    }
  };

  const confirmFromIntentBubble = async (messageId: string) => {
    if (inFlight || disabled || intentAnalyzing) return;
    const intentMsg = messages.find((m) => m.id === messageId);
    if (
      !intentMsg ||
      intentMsg.kind !== 'intent_confirm' ||
      intentMsg.confirmStatus !== 'pending'
    ) {
      return;
    }

    if (!messageId.startsWith('local-')) {
      await confirmIntent(messageId, true, understandingScope);
      return;
    }

    const trimmed = input.trim() || intentMsg.pendingUserText?.trim() || '';
    if (!trimmed) {
      appAlert('提示', zh.writing.ocrConfirmEmpty);
      return;
    }

    const action = intentMsg.pendingAction?.trim() || '润色';
    const instruction = intentMsg.pendingInstruction?.trim() || trimmed;
    const displayText = writingBubbleText(intentMsg).trim();

    try {
      const res = await api.sendWritingAssistantMessage(documentId, {
        content: trimmed,
        articleExcerpt,
        chapterId: chapterContext.chapterId,
        chapterTitle: chapterContext.chapterTitle,
        chapterContent: chapterContext.chapterContent,
        documentExcerpt: chapterContext.documentExcerpt,
        contextSelection: contextSelection ?? undefined,
        commitIntent: {
          displayText,
          action,
          instruction,
        },
        contextUsage: contextUsage ?? undefined,
      });

      setInput('');
      const linkedUserId = intentMsg.linkedUserMessageId;
      setMessages((prev) => {
        const rest = prev.filter(
          (m) => m.id !== messageId && (!linkedUserId || m.id !== linkedUserId),
        );
        return [
          ...rest,
          { ...res.data.user, status: 'done' as const },
          { ...res.data.assistant, status: 'done' as const },
        ];
      });
      scrollToEnd();
      await confirmIntent(res.data.assistant.id, true, understandingScope);
    } catch (e) {
      const { message, hint } = apiErrorText(e);
      appAlert(message, hint ? `${message}\n\n${hint}` : message);
    }
  };

  const userBubbleTextStyle = {
    fontSize: bodyFontSize,
    lineHeight: bodyLineHeight,
    color: colors.text,
  };
  const assistantBubbleTextStyle = {
    fontSize: bodyFontSize,
    lineHeight: replyLineHeight,
    color: colors.text,
  };

  const renderItem = ({ item }: { item: WritingUiMessage }) => {
    const isUser = item.role === 'user';
    const isPending = item.status === 'pending';
    const isError = item.status === 'error';
    const text = writingBubbleText(item);
    const showConfirm =
      item.kind === 'intent_confirm' &&
      item.confirmStatus === 'pending' &&
      !disabled &&
      !inFlight &&
      !intentAnalyzing;

    const showRejectedNo =
      item.kind === 'intent_confirm' && item.confirmStatus === 'rejected';

    const isNotice = item.kind === 'notice' && !isUser && !isError;
    const showGuideActions =
      isNotice &&
      item.guidePrompt &&
      !directChatLoading &&
      !intentAnalyzing &&
      !inFlight;
    const isRevisionReady = item.kind === 'revision_ready' && !isUser;
    const revisionForItem = item.revisionId
      ? revisions.find((r) => r.id === item.revisionId)
      : undefined;
    const revisionViewOnly =
      !!item.revisionId &&
      isRevisionBubbleViewOnly(item.revisionId, revisions, blockId);
    const showViewRevision =
      isRevisionReady && !!item.revisionId && !!onViewRevision;
    const revisionBasis =
      revisionBasisFromFields({
        suggestEvaluation: item.suggestEvaluation ?? revisionForItem?.suggestEvaluation,
        suggestRationale: item.suggestRationale ?? revisionForItem?.suggestRationale,
        suggestAction: item.suggestAction ?? revisionForItem?.suggestAction,
        suggestUnderstandingScope:
          item.suggestUnderstandingScope ?? revisionForItem?.suggestUnderstandingScope,
      }) ?? (revisionForItem ? revisionBasisFromRevision(revisionForItem) : null);
    const showRevisionBasis =
      showViewRevision &&
      Boolean(revisionBasis?.evaluation?.trim() || revisionBasis?.rationale?.trim());

    return (
      <View style={chatMessageStyles.row}>
        <CopyableMessageBubble
          textToCopy={text}
          disabled={isPending || !text.trim()}
          style={[
            isUser
              ? chatMessageStyles.user
              : [
                  chatMessageStyles.assistant,
                  (isNotice || isRevisionReady) && chatMessageStyles.notice,
                  isError && chatMessageStyles.error,
                ],
          ]}
        >
          {isPending ? (
            <View style={chatMessageStyles.pendingRow}>
              <ActivityIndicator color={colors.primary} size="small" style={styles.pendingSpinner} />
              <LoadingLabel
                label={text || thinkingLine}
                active
                style={[
                  chatMessageStyles.text,
                  isUser ? userBubbleTextStyle : assistantBubbleTextStyle,
                  styles.pendingText,
                ]}
              />
            </View>
          ) : item.status === 'streaming' ? (
            <Text
              style={[
                chatMessageStyles.text,
                isUser ? userBubbleTextStyle : assistantBubbleTextStyle,
              ]}
            >
              {text}
            </Text>
          ) : (
            <MessageRichText
              content={text}
              variant={isUser ? 'body' : 'reply'}
              channel="dialog"
              plainTextStyle={[
                chatMessageStyles.text,
                isUser ? userBubbleTextStyle : assistantBubbleTextStyle,
              ]}
            />
          )}
          {showGuideActions && item.guidePrompt ? (
            <AssistantGuidePromptBlock
              guideKey={item.guidePrompt.key}
              nav={guideNav}
              onJustAsk={() => triggerGuideJustAsk()}
              disabled={inFlight || directChatLoading}
              captionFontSize={captionFontSize}
            />
          ) : null}
          {showConfirm ? (
            <View style={styles.confirmBlock}>
              {chapterContext.hasMultipleChapters ? (
                <>
                  <Text style={[styles.scopeTitle, { fontSize: captionFontSize }]}>
                    {zh.writing.assistantScopeTitle}
                  </Text>
                  <Text
                    style={[
                      styles.scopeHint,
                      { fontSize: captionFontSize, lineHeight: bodyLineHeight },
                    ]}
                  >
                    {zh.writing.assistantScopeHint}
                  </Text>
                  <View style={styles.scopeRow}>
                    <Pressable
                      style={[
                        styles.scopeChip,
                        understandingScope === 'chapter' && styles.scopeChipActive,
                      ]}
                      onPress={() => setUnderstandingScope('chapter')}
                      disabled={inFlight}
                    >
                      <Text
                        style={[
                          styles.scopeChipText,
                          { fontSize: captionFontSize },
                          understandingScope === 'chapter' && styles.scopeChipTextActive,
                        ]}
                      >
                        {zh.writing.assistantScopeChapter}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.scopeChip,
                        understandingScope === 'document' && styles.scopeChipActive,
                      ]}
                      onPress={() => setUnderstandingScope('document')}
                      disabled={inFlight}
                    >
                      <Text
                        style={[
                          styles.scopeChipText,
                          { fontSize: captionFontSize },
                          understandingScope === 'document' && styles.scopeChipTextActive,
                        ]}
                      >
                        {zh.writing.assistantScopeDocument}
                      </Text>
                    </Pressable>
                  </View>
                  <Text
                    style={[
                      styles.scopeHint,
                      { fontSize: captionFontSize, lineHeight: bodyLineHeight },
                    ]}
                  >
                    {understandingScope === 'document'
                      ? zh.writing.assistantScopeDocumentHint
                      : zh.writing.assistantScopeChapterHint}
                  </Text>
                </>
              ) : null}
              <View style={styles.confirmRow}>
                <Pressable
                  style={styles.confirmYes}
                  onPress={() => void confirmFromIntentBubble(item.id)}
                  disabled={inFlight}
                >
                  <Text style={[styles.confirmYesText, { fontSize: captionFontSize }]}>
                    {zh.writing.intentConfirm}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.confirmNo}
                  onPress={() => void rejectIntent(item.id)}
                  disabled={inFlight}
                >
                  <Text style={[styles.confirmNoText, { fontSize: captionFontSize }]}>
                    {zh.writing.intentReject}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {showRejectedNo ? (
            <View style={styles.confirmBlock}>
              <Pressable style={[styles.confirmNo, styles.confirmNoDisabled]} disabled>
                <Text style={[styles.confirmNoText, styles.confirmNoTextDisabled, { fontSize: captionFontSize }]}>
                  {zh.writing.intentReject}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {showViewRevision ? (
            <View style={styles.confirmBlock}>
              {showRevisionBasis ? (
                <RevisionBasisBlock
                  basis={revisionBasis}
                  bodyFontSize={bodyFontSize}
                  bodyLineHeight={replyLineHeight}
                />
              ) : null}
              <Pressable
                style={[
                  styles.viewSuggestionInBubble,
                  revisionViewOnly && styles.viewSuggestionInBubbleDisabled,
                ]}
                onPress={() => {
                  if (!onViewRevision || !item.revisionId) return;
                  void onViewRevision(item.revisionId, revisionForItem);
                }}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={zh.writing.viewSuggestion}
              >
                <Text
                  style={[
                    styles.viewSuggestionInBubbleText,
                    { fontSize: captionFontSize },
                    revisionViewOnly && styles.viewSuggestionInBubbleTextDisabled,
                  ]}
                >
                  {zh.writing.viewSuggestion}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {isError && item.retryText ? (
            <Pressable
              style={styles.retryBtn}
              onPress={() => void requestSend(item.retryText!, 'text')}
              disabled={inFlight}
            >
              <Text style={[styles.retryBtnText, { fontSize: captionFontSize }]}>{zh.common.retry}</Text>
            </Pressable>
          ) : null}
          {isError && item.retryConfirm ? (
            <Pressable
              style={styles.retryBtn}
              onPress={() =>
                void confirmIntent(
                  item.retryConfirm!.messageId,
                  item.retryConfirm!.approved,
                  item.retryConfirm!.understandingScope ?? understandingScope,
                )
              }
              disabled={inFlight}
            >
              <Text style={[styles.retryBtnText, { fontSize: captionFontSize }]}>{zh.common.retry}</Text>
            </Pressable>
          ) : null}
        </CopyableMessageBubble>
      </View>
    );
  };

  return (
    <View style={styles.panel}>
      {showTitle ? (
        <Text style={[styles.panelTitle, { fontSize: captionFontSize }]}>{zh.writing.assistantTitle}</Text>
      ) : null}
      <FlatList
        ref={listRef}
        style={styles.list}
        data={messages}
        keyExtractor={(m) => m.id}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={renderItem}
        contentContainerStyle={
          messages.length === 0 && !loadError ? styles.listContentEmpty : styles.listContent
        }
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          loadError ? (
            <ReconnectBanner
              message={loadError}
              hint={loadErrorHint}
              onRetry={() => void loadMessages()}
            />
          ) : (
            <Text style={[styles.emptyHint, { fontSize: captionFontSize, lineHeight: bodyLineHeight }]}>
              {zh.writing.assistantEmpty}
            </Text>
          )
        }
      />
      {contextDetailUsage ? (
        <Pressable
          style={styles.contextOverlay}
          onPress={() => setContextDetailUsage(null)}
          accessibilityViewIsModal
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <ContextUsageDetailModal
              inline
              visible
              usage={contextDetailUsage}
              onClose={() => setContextDetailUsage(null)}
            />
          </Pressable>
        </Pressable>
      ) : null}
      {intentAnalyzing || directChatLoading ? (
        <AssistantLoadingRow
          label={intentAnalyzingLine}
          active
          rowStyle={styles.intentAnalyzingRow}
          textStyle={[styles.intentAnalyzingText, { fontSize: captionFontSize }]}
        />
      ) : null}
      <AssistantComposeDock
        inputRef={composeRef}
        input={input}
        onChangeText={setInput}
        onSend={send}
        onVoiceText={(t) => void requestSend(t, 'voice')}
        placeholder={zh.writing.assistantPlaceholder}
        sendLabel={zh.writing.sendToAssistant}
        disabled={disabled || hasPendingIntentConfirm}
        busy={inFlight || ocrBusy || intentAnalyzing || directChatLoading}
        onPickImagePress={
          onStartOcr && !disabled && !inFlight && !ocrBusy ? onStartOcr : undefined
        }
        imageActionLabel={zh.writing.recognizeImage}
      />
      <>
          <ContextHubSheet
            visible={contextHubOpen}
            onClose={() => setContextHubOpen(false)}
            onComposeContext={() => setComposerOpen(true)}
          />
          <ContextComposerModal
            visible={composerOpen}
            source="writing"
            documentId={documentId}
            chapterTitle={chapterContext.chapterTitle}
            chapterContent={chapterContext.chapterContent}
            documentExcerpt={chapterContext.documentExcerpt}
            pendingText={input}
            initialSelection={contextSelection}
            onClose={() => setComposerOpen(false)}
            onApply={(sel) => {
              setContextSelection(sel);
              void refreshContextUsage(input);
            }}
          />
        </>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, minHeight: 0, backgroundColor: 'transparent' },
  contextOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 20,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  panelTitle: {
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 8,
    textAlign: 'center',
  },
  list: { flex: 1 },
  listContent: { paddingBottom: 12, paddingHorizontal: 2 },
  listContentEmpty: { flexGrow: 1, justifyContent: 'center' },
  pendingSpinner: { marginTop: 6 },
  pendingText: { flex: 1, color: colors.textMuted },
  emptyHint: { color: colors.textMuted, textAlign: 'center', padding: 16 },
  loadError: {
    color: colors.error,
    textAlign: 'center',
    padding: 16,
  },
  retryBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retryBtnText: { color: colors.onPrimary, fontWeight: '600' },
  intentAnalyzingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  intentAnalyzingText: { color: colors.textMuted, fontWeight: '600' },
  confirmBlock: { marginTop: 12, gap: 8 },
  scopeTitle: { fontWeight: '700', color: colors.text },
  scopeHint: { color: colors.textMuted },
  scopeRow: { flexDirection: 'row', gap: 8 },
  scopeChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  scopeChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  scopeChipText: { color: colors.textMuted, fontWeight: '600', textAlign: 'center' },
  scopeChipTextActive: { color: colors.text },
  confirmRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  confirmYes: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmYesText: { color: colors.onPrimary, fontWeight: '600' },
  confirmNo: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  confirmNoText: { color: colors.text, fontWeight: '600' },
  confirmNoDisabled: {
    opacity: 0.45,
    backgroundColor: colors.border,
    borderColor: colors.border,
  },
  confirmNoTextDisabled: { color: colors.textMuted },
  viewSuggestionInBubble: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  viewSuggestionInBubbleDisabled: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  viewSuggestionInBubbleText: { color: colors.onPrimary, fontWeight: '700' },
  viewSuggestionInBubbleTextDisabled: {
    color: colors.primaryMutedText,
    fontWeight: '600',
  },
});
