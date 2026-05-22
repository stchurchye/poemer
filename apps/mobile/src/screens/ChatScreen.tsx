import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import { appAlert } from '../lib/appAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AssistantGuideKey, ChatSession, ContextSelection, ContextUsage } from '@shiren/shared';
import { api } from '../lib/api';
import { apiErrorText, apiLoadErrorText } from '../lib/apiError';
import { useReconnectEffect, useSuppressGlobalOfflineBanner } from '../context/ApiConnectivityContext';
import { LoadErrorView } from '../components/LoadErrorView';
import { ReconnectBanner } from '../components/ReconnectBanner';
import {
  getAssistantIntentAnalyzingLine,
  getAssistantThinkingLine,
  getAssistantThinkingLongLine,
} from '../lib/assistantCopy';
import {
  announceAssistantReplyParallel,
  announceAssistantReplySync,
  announceAssistantWaiting,
  cancelAssistantFeedback,
} from '../lib/assistantFeedback';
import { isSpeaking, speakText, stopSpeaking } from '../lib/tts';
import { useListAutoScroll } from '../hooks/useListAutoScroll';
import { animateTypewriter } from '../lib/typewriter';
import { CHAT_MAX_IMAGES_PER_MESSAGE, chatStoredUserContent } from '@shiren/shared';
import { assetToBase64 } from '../lib/imageBase64';
import {
  pickChatImagesFromSource,
  promptChatImageSource,
  type PickedChatImage,
} from '../lib/pickChatImage';
import { getZenMuxApiKey } from '../lib/zenmuxKey';
import { chatBubbleText, collectAssistantRepliesFromScreen, type ChatUiMessage } from '../lib/uiMessage';
import { MessageRichText } from '../components/MessageRichText';
import { AssistantGuidePromptBlock } from '../components/AssistantGuidePromptBlock';
import { AssistantLoadingRow, LoadingLabel } from '../components/AssistantLoadingRow';
import { CopyableMessageBubble } from '../components/CopyableMessageBubble';
import { AssistantComposeDock } from '../components/AssistantComposeDock';
import { PendingChatImagesStrip } from '../components/PendingChatImagesStrip';
import { HeaderContextMeter } from '../components/HeaderContextMeter';
import { ChatIntentConfirmBar } from '../components/ChatIntentConfirmBar';
import { ContextComposerModal } from '../components/ContextComposerModal';
import { ContextUsageDetailModal } from '../components/ContextUsageDetailModal';
import { ChatToolsPanel } from '../components/ChatToolsPanel';
import { TabletFrame } from '../components/TabletFrame';
import { WritingAssistantSheet } from '../components/WritingAssistantSheet';
import { colors, typography } from '../theme/colors';
import { useLayout } from '../theme/layout';
import { chatMessageStyles } from '../theme/chatMessage';
import { useTextStyles } from '../theme/useTextStyles';
import { radius, touch } from '../theme/tokens';
import type { RootTabParamList } from '../navigation/types';
import { zh } from '../locales/zh-CN';

function localChatMessage(
  sessionId: string,
  role: ChatUiMessage['role'],
  content: string,
  extra?: Partial<ChatUiMessage>,
): ChatUiMessage {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sessionId,
    role,
    content,
    createdAt: new Date().toISOString(),
    status: 'done',
    ...extra,
  };
}

export function ChatScreen() {
  const tabNav = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const insets = useSafeAreaInsets();
  const { isTablet } = useLayout();
  const textStyles = useTextStyles('dialog');
  const [session, setSession] = useState<ChatSession | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [thinkingLine, setThinkingLine] = useState<string>(zh.writing.thinkingZh);
  const [thinkingLongLine, setThinkingLongLine] = useState<string>(zh.writing.thinkingLongZh);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
  const [contextUsageLoading, setContextUsageLoading] = useState(false);
  const [contextSelection, setContextSelection] = useState<ContextSelection | null>(null);
  const [contextDetailUsage, setContextDetailUsage] = useState<ContextUsage | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [compactBusy, setCompactBusy] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<{
    rawText: string;
    source: 'text' | 'voice';
    displayText: string;
    sendContent: string;
    ready: boolean;
  } | null>(null);
  const [intentAnalyzing, setIntentAnalyzing] = useState(false);
  const [intentAnalyzingLine, setIntentAnalyzingLine] = useState<string>(
    zh.writing.intentAnalyzingZh,
  );
  const pendingGuideRef = useRef<{
    key: AssistantGuideKey;
    userText: string;
    source: 'text' | 'voice';
  } | null>(null);
  const [pendingImages, setPendingImages] = useState<PickedChatImage[]>([]);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapErrorHint, setBootstrapErrorHint] = useState<string | undefined>();
  useSuppressGlobalOfflineBanner(Boolean(bootstrapError));
  const { listRef, onScroll, scrollToEnd, scrollToEndIfFollowing } = useListAutoScroll();
  const sendingRef = useRef(false);
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

  const refreshSessions = useCallback(async () => {
    const res = await api.listChatSessions();
    setSessions(res.data);
    return res.data;
  }, []);

  const refreshContextUsage = useCallback(
    async (pending?: string) => {
      const sessionId = session?.id;
      if (!sessionId) {
        setContextUsage(null);
        return;
      }
      setContextUsageLoading(true);
      try {
        const res = await api.getChatContextUsage(sessionId, {
          pending,
          contextSelection: contextSelection ?? undefined,
        });
        setContextUsage(res.data);
      } catch {
        setContextUsage(null);
      } finally {
        setContextUsageLoading(false);
      }
    },
    [session?.id, contextSelection],
  );

  const ensureSession = useCallback(async () => {
    const list = await refreshSessions();
    if (list.length > 0) {
      setSession(list[0]);
      return list[0].id;
    }
    const created = await api.createChatSession();
    setSession(created.data);
    await refreshSessions();
    return created.data.id;
  }, [refreshSessions]);

  const loadMessages = useCallback(
    async (sessionId: string) => {
      const res = await api.getChatMessages(sessionId);
      setMessages(res.data.map((m) => ({ ...m, status: 'done' as const })));
      scrollToEnd();
    },
    [scrollToEnd],
  );

  const bootstrapChat = useCallback(async () => {
    setBootstrapLoading(true);
    setBootstrapError(null);
    setBootstrapErrorHint(undefined);
    try {
      const id = await ensureSession();
      await loadMessages(id);
      await refreshContextUsage();
    } catch (e) {
      const err = apiLoadErrorText(e);
      setBootstrapError(err.message);
      setBootstrapErrorHint(err.hint);
    } finally {
      setBootstrapLoading(false);
    }
  }, [ensureSession, loadMessages, refreshContextUsage]);

  useEffect(() => {
    void bootstrapChat();
  }, [bootstrapChat]);

  useReconnectEffect(() => {
    void bootstrapChat();
  }, [bootstrapChat]);

  useEffect(() => {
    if (messages.length === 0) return;
    scrollToEnd(false);
    const t1 = setTimeout(() => scrollToEnd(false), 200);
    const t2 = setTimeout(() => scrollToEnd(false), 520);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [session?.id, messages.length, scrollToEnd]);

  useFocusEffect(
    useCallback(() => {
      void cancelAssistantFeedback();
      void stopSpeaking();
      setSpeaking(false);

      if (messages.length > 0) {
        scrollToEnd(false);
      }
      const t =
        messages.length > 0 ? setTimeout(() => scrollToEnd(false), 280) : undefined;
      return () => {
        if (t) clearTimeout(t);
        void cancelAssistantFeedback();
        void stopSpeaking();
        setSpeaking(false);
      };
    }, [messages.length, scrollToEnd]),
  );

  useEffect(() => {
    void refreshContextUsage();
  }, [session?.id, refreshContextUsage]);

  useEffect(() => {
    const sessionId = session?.id;
    if (!sessionId) return;
    const timer = setTimeout(() => {
      void refreshContextUsage(input);
    }, 300);
    return () => clearTimeout(timer);
  }, [session?.id, input, refreshContextUsage]);

  useEffect(() => {
    if (!toolsOpen) return;
    void refreshSessions();
  }, [toolsOpen, refreshSessions]);

  useEffect(() => {
    void (async () => {
      setThinkingLine(await getAssistantThinkingLine());
      setThinkingLongLine(await getAssistantThinkingLongLine());
      setIntentAnalyzingLine(await getAssistantIntentAnalyzingLine());
    })();
  }, []);

  useEffect(() => {
    return () => {
      typewriterAbortRef.current?.abort();
      void cancelAssistantFeedback();
      void stopSpeaking();
    };
  }, []);

  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  useEffect(() => {
    if (!sending) return;
    const timer = setTimeout(() => {
      if (!sendingRef.current) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.status === 'pending' ? { ...m, displayContent: thinkingLongLine } : m,
        ),
      );
      if (!sendingRef.current) return;
      void announceAssistantWaiting(thinkingLongLine);
    }, 28_000);
    return () => clearTimeout(timer);
  }, [sending, thinkingLongLine]);

  const revealAssistant = useCallback(
    async (assistantId: string, fullText: string) => {
      typewriterAbortRef.current?.abort();
      const ac = new AbortController();
      typewriterAbortRef.current = ac;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, status: 'streaming', content: fullText, displayContent: '' }
            : m,
        ),
      );
      await animateTypewriter(
        fullText,
        (visible) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, displayContent: visible } : m)),
          );
          scrollToEndIfFollowing();
        },
        { signal: ac.signal },
      );
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, status: 'done', displayContent: undefined } : m,
        ),
      );
    },
    [scrollToEndIfFollowing],
  );

  const handleCompactContext = useCallback(async () => {
    const sessionId = session?.id ?? (await ensureSession());
    setCompactBusy(true);
    try {
      const res = await api.compactChatSession(sessionId);
      setContextUsage(res.data.contextUsage);
      const compactText = res.data.assistantMessage.content?.trim() ?? '';
      setMessages((prev) => [
        ...prev,
        { ...res.data.assistantMessage, status: 'done' as const },
      ]);
      scrollToEnd();
      if (compactText) {
        announceAssistantReplyParallel(compactText);
      }
      setContextDetailUsage(null);
    } catch (e) {
      const { message, hint } = apiErrorText(e);
      appAlert(message, hint ?? message);
    } finally {
      setCompactBusy(false);
    }
  }, [session?.id, ensureSession, scrollToEnd]);

  const dispatchChatMessage = useCallback(
    async (text: string, images: PickedChatImage[] = []) => {
      const trimmed = text.trim();
      const imageCount = images.length;
      if ((!trimmed && imageCount === 0) || sending) return;

      if (imageCount > 0) {
        const zenmuxKey = await getZenMuxApiKey();
        if (!zenmuxKey) {
          appAlert('提示', zh.chat.imageSendNeedsZenmux);
          return;
        }
      }

      const imagePayload: Array<{ imageBase64: string; mimeType?: string }> = [];
      for (const img of images) {
        const b64 = await assetToBase64(img);
        if (!b64) {
          appAlert('提示', zh.chat.imageEncodeFailed);
          return;
        }
        imagePayload.push({ imageBase64: b64, mimeType: img.mimeType ?? 'image/jpeg' });
      }

      const sendContent = trimmed || zh.chat.imageOnlyPlaceholder;
      const bubbleText = chatStoredUserContent({
        text: trimmed,
        imageCount,
        imageOnlyFallback: zh.chat.imageOnlyPlaceholder,
      });

      const sessionId = session?.id ?? (await ensureSession());
      const userId = `local-user-${Date.now()}`;
      const assistantId = `local-asst-${Date.now()}`;

      const userMsg = localChatMessage(sessionId, 'user', bubbleText, { id: userId });
      const pendingAssistant = localChatMessage(sessionId, 'assistant', '', {
        id: assistantId,
        status: 'pending',
        displayContent: thinkingLine,
        retryText: sendContent,
      });

      setInput('');
      setMessages((prev) => [...prev, userMsg, pendingAssistant]);
      setPendingImages([]);
      scrollToEnd();
      void announceAssistantWaiting(thinkingLine);
      setSending(true);

      try {
        const res = await api.sendChatMessage(sessionId, {
          content: sendContent,
          images: imagePayload.length > 0 ? imagePayload : undefined,
          contextSelection: contextSelection ?? undefined,
        });
        const fullText = res.data.assistant?.content ?? '';
        sendingRef.current = false;
        const ttsReady = fullText.trim()
          ? announceAssistantReplySync(fullText)
          : Promise.resolve();
        setMessages((prev) => {
          const rest = prev.filter((m) => m.id !== userId && m.id !== assistantId);
          return [
            ...rest,
            { ...res.data.user, status: 'done' as const },
            {
              ...res.data.assistant!,
              id: assistantId,
              status: 'pending' as const,
              content: fullText,
              displayContent: thinkingLine,
            },
          ];
        });
        await ttsReady;
        setMessages((prev) => {
          const rest = prev.filter((m) => m.id !== userId);
          return rest.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  status: 'streaming' as const,
                  content: fullText,
                  displayContent: '',
                }
              : m,
          );
        });
        await revealAssistant(assistantId, fullText);
        const serverAssistant = res.data.assistant!;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...serverAssistant, status: 'done' as const, displayContent: undefined }
              : m,
          ),
        );
        if (res.data.session) {
          setSession(res.data.session);
        }
        void refreshSessions();
        scrollToEnd();
      } catch (e) {
        const { message, hint } = apiErrorText(e);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  status: 'error',
                  content: hint ? `${message}\n\n${hint}` : message,
                  displayContent: undefined,
                  retryText: sendContent,
                }
              : m,
          ),
        );
        scrollToEnd();
        void refreshSessions();
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [
      session?.id,
      ensureSession,
      sending,
      revealAssistant,
      scrollToEnd,
      thinkingLine,
      refreshSessions,
      contextSelection,
    ],
  );

  const chatGuideNav = useMemo(
    () => ({
      tabNav,
      openChatTools: () => setToolsOpen(true),
    }),
    [tabNav],
  );

  const triggerGuideJustAsk = useCallback(() => {
    const ctx = pendingGuideRef.current;
    if (!ctx || sending || intentAnalyzing) return;
    void dispatchChatMessage(ctx.userText);
  }, [dispatchChatMessage, sending, intentAnalyzing]);

  const requestSend = useCallback(
    async (text: string, source: 'text' | 'voice') => {
      const trimmed = text.trim();
      const images = pendingImages;
      const hasImages = images.length > 0;
      if ((!trimmed && !hasImages) || sending || intentAnalyzing) return;

      if (trimmed === '/压缩' || trimmed === '压缩') {
        setInput('');
        setPendingIntent(null);
        await handleCompactContext();
        return;
      }

      if (hasImages) {
        setPendingIntent(null);
        if (source === 'text') setInput('');
        await dispatchChatMessage(trimmed, [...images]);
        return;
      }

      const sessionId = session?.id ?? (await ensureSession());
      const userId = `local-user-${Date.now()}`;
      if (source === 'text') setInput('');
      setPendingIntent(null);

      const analyzingLine = await getAssistantIntentAnalyzingLine();
      setIntentAnalyzingLine(analyzingLine);
      setIntentAnalyzing(true);
      void announceAssistantWaiting(analyzingLine);

      try {
        const res = await api.analyzeChatIntent(sessionId, { content: trimmed, source });
        if (res.data.guide) {
          const guideKey = res.data.guide;
          const copy = zh.guide[guideKey];
          pendingGuideRef.current = {
            key: guideKey,
            userText: trimmed,
            source,
          };
          setMessages((prev) => [
            ...prev.filter((m) => !m.localGuideNotice),
            localChatMessage(sessionId, 'user', trimmed, { id: userId, status: 'done' }),
            localChatMessage(sessionId, 'assistant', `${copy.title}\n\n${copy.message}`, {
              localGuideNotice: true,
              guidePrompt: {
                key: guideKey,
                userText: trimmed,
                linkedUserBubbleId: userId,
                source,
              },
            }),
          ]);
          scrollToEnd();
          return;
        }
        setPendingIntent({
          rawText: trimmed,
          source,
          displayText: res.data.displayText,
          sendContent: res.data.sendContent,
          ready: res.data.ready,
        });
        scrollToEnd();
      } catch (e) {
        const { message, hint } = apiErrorText(e);
        if (source === 'text') setInput(trimmed);
        appAlert(zh.chat.intentAnalyzeFailed, hint ? `${message}\n\n${hint}` : message);
      } finally {
        void cancelAssistantFeedback();
        setIntentAnalyzing(false);
      }
    },
    [
      session?.id,
      ensureSession,
      sending,
      intentAnalyzing,
      handleCompactContext,
      scrollToEnd,
      pendingImages,
      dispatchChatMessage,
    ],
  );

  const confirmPendingSend = useCallback(() => {
    if (!pendingIntent || sending) return;
    const toSend =
      pendingIntent.ready && pendingIntent.sendContent.trim()
        ? pendingIntent.sendContent.trim()
        : pendingIntent.rawText.trim();
    setPendingIntent(null);
    void dispatchChatMessage(toSend);
  }, [pendingIntent, sending, dispatchChatMessage]);

  const cancelPendingSend = useCallback(() => {
    setPendingIntent(null);
  }, []);

  const switchSession = useCallback(
    async (sessionId: string) => {
      if (sending || intentAnalyzing || session?.id === sessionId) return;
      setPendingIntent(null);
      setPendingImages([]);
      typewriterAbortRef.current?.abort();
      void cancelAssistantFeedback();
      void stopSpeaking();
      setSpeaking(false);
      const target = sessions.find((s) => s.id === sessionId);
      if (target) setSession(target);
      else {
        const list = await refreshSessions();
        const found = list.find((s) => s.id === sessionId);
        if (found) setSession(found);
      }
      await loadMessages(sessionId);
      void refreshContextUsage();
    },
    [sending, intentAnalyzing, session?.id, sessions, loadMessages, refreshSessions, refreshContextUsage],
  );

  const newSession = async () => {
    if (sending || intentAnalyzing) return;
    const created = await api.createChatSession();
    setSession(created.data);
    setMessages([]);
    setInput('');
    setPendingIntent(null);
    setPendingImages([]);
    setContextUsage(null);
    await refreshSessions();
  };

  const handlePickImage = useCallback(() => {
    if (sending || intentAnalyzing || pendingIntent) return;
    promptChatImageSource((source) => {
      void (async () => {
        const remaining = CHAT_MAX_IMAGES_PER_MESSAGE - pendingImages.length;
        const picked = await pickChatImagesFromSource(source, { remainingSlots: remaining });
        if (!picked.length) return;
        setPendingIntent(null);
        setPendingImages((prev) =>
          [...prev, ...picked].slice(0, CHAT_MAX_IMAGES_PER_MESSAGE),
        );
      })();
    });
  }, [sending, intentAnalyzing, pendingIntent, pendingImages.length]);

  const removePendingImage = useCallback((id: string) => {
    setPendingImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const toggleReadAloud = async () => {
    if (await isSpeaking()) {
      await stopSpeaking();
      setSpeaking(false);
      return;
    }

    const text = collectAssistantRepliesFromScreen(messages, visibleIndicesRef.current);
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
      await speakText(text, {
        onDone: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
    } catch {
      setSpeaking(false);
    }
  };

  const renderMessage = ({ item }: { item: ChatUiMessage }) => {
    const isUser = item.role === 'user';
    const isPending = item.status === 'pending';
    const isError = item.status === 'error';
    const isGuideNotice = Boolean(item.localGuideNotice && !isUser);
    const showGuideActions =
      isGuideNotice && item.guidePrompt && !sending && !intentAnalyzing;
    const bubbleContent = chatBubbleText(item);

    return (
      <View style={chatMessageStyles.row}>
        <CopyableMessageBubble
          textToCopy={bubbleContent}
          disabled={isPending || !bubbleContent.trim()}
          style={[
            isUser
              ? [chatMessageStyles.user, isTablet && chatMessageStyles.userTablet]
              : [
                  chatMessageStyles.assistant,
                  isTablet && chatMessageStyles.assistantTablet,
                  isGuideNotice && chatMessageStyles.notice,
                  isError && chatMessageStyles.error,
                ],
          ]}
        >
          {isPending ? (
            <View style={chatMessageStyles.pendingRow}>
              <ActivityIndicator color={colors.primary} size="small" style={styles.pendingSpinner} />
              <LoadingLabel
                label={bubbleContent || thinkingLine}
                active
                style={[
                  chatMessageStyles.text,
                  isUser ? textStyles.body : textStyles.reply,
                  styles.pendingText,
                ]}
              />
            </View>
          ) : item.status === 'streaming' ? (
            <Text style={[chatMessageStyles.text, isUser ? textStyles.body : textStyles.reply]}>
              {bubbleContent}
            </Text>
          ) : (
            <MessageRichText
              content={bubbleContent}
              variant={isUser ? 'body' : 'reply'}
              channel="dialog"
              plainTextStyle={[chatMessageStyles.text, isUser ? textStyles.body : textStyles.reply]}
            />
          )}
          {showGuideActions && item.guidePrompt ? (
            <AssistantGuidePromptBlock
              guideKey={item.guidePrompt.key}
              nav={chatGuideNav}
              onJustAsk={() => triggerGuideJustAsk()}
              disabled={sending || intentAnalyzing}
              captionFontSize={typography.caption}
            />
          ) : null}
          {isError && item.retryText ? (
            <Pressable
              style={styles.retryBtn}
              onPress={() => void dispatchChatMessage(item.retryText!)}
              disabled={sending || intentAnalyzing}
            >
              <Text style={styles.retryBtnText}>{zh.common.retry}</Text>
            </Pressable>
          ) : null}
        </CopyableMessageBubble>
      </View>
    );
  };

  const canReadReply = messages.some((m) => m.role === 'assistant' && m.status === 'done');

  const showHeaderContext =
    contextUsage !== null || contextUsageLoading || session !== null;

  const composeFooter = (
    <View style={[styles.composeWrap, isTablet && styles.composeWrapTablet]}>
      {intentAnalyzing ? (
        <AssistantLoadingRow
          label={intentAnalyzingLine}
          active
          rowStyle={styles.intentAnalyzingRow}
          textStyle={styles.intentAnalyzingText}
        />
      ) : null}
      {pendingIntent ? (
        <ChatIntentConfirmBar
          rawText={pendingIntent.rawText}
          displayText={pendingIntent.displayText}
          source={pendingIntent.source}
          onConfirm={() => confirmPendingSend()}
          onCancel={cancelPendingSend}
          disabled={sending}
        />
      ) : null}
      <PendingChatImagesStrip images={pendingImages} onRemove={removePendingImage} />
      <AssistantComposeDock
        input={input}
        onChangeText={setInput}
        onSend={() => void requestSend(input, 'text')}
        onVoiceText={(t) => void requestSend(t, 'voice')}
        placeholder={zh.chat.placeholder}
        sendLabel={zh.chat.send}
        busy={sending || intentAnalyzing}
        disabled={Boolean(pendingIntent)}
        sendAlsoWhen={pendingImages.length > 0}
        imageActionLabel={zh.chat.sendImage}
        onPickImagePress={handlePickImage}
      />
    </View>
  );

  if (bootstrapError && messages.length === 0 && !bootstrapLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <LoadErrorView
          message={bootstrapError}
          hint={bootstrapErrorHint}
          onRetry={() => void bootstrapChat()}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={isTablet ? 70 : 90}
    >
      <TabletFrame variant="full" style={styles.frame}>
        <View style={styles.shell}>
          <View style={styles.chatPane}>
            {bootstrapError ? (
              <ReconnectBanner
                message={bootstrapError}
                hint={bootstrapErrorHint}
                onRetry={() => void bootstrapChat()}
              />
            ) : null}
            <View style={styles.headerRow}>
              <View style={styles.headerTitleRow}>
                <Text
                  style={[
                    styles.header,
                    isTablet && styles.headerTablet,
                    { fontSize: isTablet ? typography.title + 2 : typography.title },
                  ]}
                  numberOfLines={2}
                >
                  {zh.chat.title}
                </Text>
                {showHeaderContext ? (
                  <HeaderContextMeter
                    ratio={contextUsage?.ratio ?? 0}
                    loading={contextUsageLoading}
                    onPress={() => {
                      if (contextUsage) setContextDetailUsage(contextUsage);
                    }}
                    onLongPress={() => setComposerOpen(true)}
                  />
                ) : null}
              </View>
              <View style={styles.headerActions}>
                <Pressable
                  style={[
                    styles.readBtn,
                    speaking && styles.readBtnActive,
                    !canReadReply && !speaking && styles.readBtnDisabled,
                  ]}
                  onPress={() => void toggleReadAloud()}
                  disabled={!canReadReply && !speaking}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={speaking ? zh.writing.stopReading : zh.writing.readMode}
                >
                  <Text style={[styles.readBtnText, speaking && styles.readBtnTextActive]}>
                    {speaking ? zh.writing.stopReading : zh.writing.readMode}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.toolsOpenBtn}
                  onPress={() => setToolsOpen(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={zh.chat.openTools}
                >
                  <Text style={styles.toolsOpenBtnText}>{zh.chat.openTools}</Text>
                </Pressable>
              </View>
            </View>
            <FlatList
              ref={listRef}
              style={styles.list}
              data={messages}
              keyExtractor={(m) => m.id}
              onScroll={onScroll}
              scrollEventThrottle={16}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              contentContainerStyle={
                messages.length === 0 ? styles.listContentEmpty : styles.listContent
              }
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              renderItem={renderMessage}
              ListEmptyComponent={
                <Text style={[styles.empty, isTablet && styles.emptyTablet]}>
                  有什么想聊的，尽管问小助手。
                </Text>
              }
            />
            {composeFooter}
          </View>
        </View>
      </TabletFrame>

      <WritingAssistantSheet
        visible={toolsOpen}
        title={zh.chat.sideTitle}
        closeLabel={zh.chat.closeTools}
        onClose={() => setToolsOpen(false)}
      >
        <ChatToolsPanel
          sessions={sessions}
          currentSessionId={session?.id ?? null}
          sending={sending}
          onNewSession={() => {
            void newSession();
          }}
          onSelectSession={(sessionId) => {
            void switchSession(sessionId).then(() => setToolsOpen(false));
          }}
        />
      </WritingAssistantSheet>

      <ContextUsageDetailModal
        visible={contextDetailUsage != null}
        usage={contextDetailUsage}
        onClose={() => setContextDetailUsage(null)}
        onCompact={() => void handleCompactContext()}
        compactBusy={compactBusy}
      />

      <ContextComposerModal
        visible={composerOpen}
        source="chat"
        sessionId={session?.id}
        pendingText={input}
        initialSelection={contextSelection}
        onClose={() => setComposerOpen(false)}
        onApply={(sel) => {
          setContextSelection(sel);
          void refreshContextUsage(input);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  frame: { flex: 1 },
  shell: { flex: 1, minHeight: 0, position: 'relative' },
  chatPane: { flex: 1, minHeight: 0 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
    flexShrink: 0,
  },
  headerTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    minWidth: 0,
    marginRight: 8,
  },
  header: {
    flex: 0,
    flexShrink: 1,
    fontWeight: '700',
    color: colors.text,
  },
  headerTablet: { marginBottom: 0 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  readBtn: {
    minHeight: touch.min,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  readBtnActive: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  readBtnDisabled: { opacity: 0.45 },
  readBtnText: {
    fontSize: typography.caption,
    color: colors.textMuted,
    fontWeight: '500',
  },
  readBtnTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  toolsOpenBtn: {
    minHeight: touch.min,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  toolsOpenBtnText: {
    fontSize: typography.caption,
    fontWeight: '700',
    color: colors.primary,
  },
  list: { flex: 1, minHeight: 0 },
  listContent: { paddingBottom: 16, paddingHorizontal: 4 },
  listContentEmpty: { flexGrow: 1, justifyContent: 'center' },
  pendingSpinner: { marginTop: 6 },
  pendingText: { flex: 1, color: colors.textMuted },
  retryBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retryBtnText: { color: colors.onPrimary, fontWeight: '600', fontSize: typography.caption },
  empty: {
    fontSize: typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 40,
    lineHeight: typography.bodyLineHeight,
  },
  emptyTablet: { fontSize: typography.body, marginTop: 56 },
  composeWrap: {
    flexShrink: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    paddingHorizontal: 4,
  },
  composeWrapTablet: { paddingTop: 12, paddingHorizontal: 0 },
  intentAnalyzingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  intentAnalyzingText: {
    fontSize: typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
