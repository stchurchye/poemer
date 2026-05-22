import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorChromeCollapse } from '../hooks/useEditorChromeCollapse';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { appAlert } from '../lib/appAlert';
import { filterVisibleDocuments } from '../lib/documentVisibility';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  buildChapterTitle,
  buildWritingAssistantChapterContext,
  parseChapterTitle,
  type Document,
  type Revision,
  type WritingUnderstandingScope,
} from '@shiren/shared';
import { api } from '../lib/api';
import { clientLog } from '../lib/clientLog';
import {
  openDiffPreview,
  waitForAssistantModalDismiss,
} from '../lib/openDiffPreview';
import { resolveRevisionForView } from '../lib/resolveRevisionForView';
import { resolveSuggestionViewPolicy } from '../lib/suggestionViewOnly';
import type { AssistantGuideNav } from '../lib/assistantGuide';
import type { RootTabParamList } from '../navigation/types';
import { pickReadPortion, type ReadPortionMode, type TextSelection } from '../lib/readAloud';
import { cancelAssistantFeedback } from '../lib/assistantFeedback';
import { isSpeaking, speakText, stopSpeaking } from '../lib/tts';
import { AppTextInput } from '../components/AppTextInput';
import { LoadErrorView } from '../components/LoadErrorView';
import { ReconnectBanner } from '../components/ReconnectBanner';
import {
  getCachedDocument,
  getCachedTabs,
  rememberDocument,
  rememberTabs,
} from '../lib/writingCache';
import { ChapterShareCard } from '../components/ChapterShareCard';
import { WritingAssistantPanel } from '../components/WritingAssistantPanel';
import { OcrChapterPickerModal } from '../components/OcrChapterPickerModal';
import { OcrConfirmModal } from '../components/OcrConfirmModal';
import { OcrLoadingModal } from '../components/OcrLoadingModal';
import { OcrOptionModal } from '../components/OcrOptionModal';
import { OcrPlacementBar } from '../components/OcrPlacementBar';
import {
  insertTextAtOffset,
  type OcrPlacementTarget,
} from '../lib/ocrInsert';
import {
  pickAssistantOcrImagesFromSource,
  promptAssistantOcrImages,
  type PickedOcrImage,
} from '../lib/assistantOcrSession';
import { recognizeImageFromAsset } from '../lib/recognizeImage';
import { apiErrorText, apiLoadErrorText, formatApiErrorAlertBody } from '../lib/apiError';
import {
  useReconnectEffect,
  useSuppressGlobalOfflineBanner,
} from '../context/ApiConnectivityContext';
import { promptText } from '../lib/promptText';
import {
  WritingAssistantSheet,
  type AssistantHeaderContext,
  type AssistantHeaderReadAloud,
} from '../components/WritingAssistantSheet';
import {
  copyChapterText,
  ensureSaveToAlbumPermission,
  saveChapterImageToAlbum,
  type ChapterSharePayload,
} from '../lib/chapterShare';
import { TabletFrame } from '../components/TabletFrame';
import { colors, typography } from '../theme/colors';
import { radius } from '../theme/tokens';
import { useLayout, useTypography } from '../theme/layout';
import { zh } from '../locales/zh-CN';
import type { WritingStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<WritingStackParamList, 'WritingMain'>;

/** 略长于默认，避免快速切换时误触长按 */
const RENAME_LONG_PRESS_MS = 520;

function WritingToolbarChip({
  label,
  onPress,
  active,
  disabled,
  loading,
  tone = 'default',
  fontSize,
  lineHeight,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'default' | 'light';
  fontSize: number;
  lineHeight: number;
}) {
  const isLight = tone === 'light' && !active;
  return (
    <Pressable
      style={[
        styles.toolbarChip,
        isLight && styles.toolbarChipLight,
        active && styles.toolbarChipActive,
        (disabled || loading) && styles.toolbarChipDisabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={8}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={active ? colors.onPrimary : isLight ? colors.textMuted : colors.primary}
        />
      ) : (
        <Text
          style={[
            styles.toolbarChipText,
            { fontSize, lineHeight },
            isLight && styles.toolbarChipLightText,
            active && styles.toolbarChipTextActive,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function WritingScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { isTablet, smallFontSize } = useLayout();
  const { bodyFontSize, bodyLineHeight } = useTypography('article');
  const chromeFontSize = smallFontSize;
  const chromeLineHeight = Math.round(chromeFontSize * 1.15);
  const { collapsed: editorChromeCollapsed, onInputFocus, onInputBlur, expandChrome } =
    useEditorChromeCollapse();
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [initErrorHint, setInitErrorHint] = useState<string | undefined>();
  const [creating, setCreating] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(route.params?.documentId ?? null);
  const [doc, setDoc] = useState<Document | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [docErrorHint, setDocErrorHint] = useState<string | undefined>();
  useSuppressGlobalOfflineBanner(Boolean(initError || docError));
  const [toast, setToast] = useState(route.params?.toast);
  const [bodyDraft, setBodyDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [readHint, setReadHint] = useState<string | null>(null);
  const [selection, setSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [addingChapter, setAddingChapter] = useState(false);
  /** 最近一次改稿建议（保持原样后仍可「看一看」） */
  const [suggestionRevision, setSuggestionRevision] = useState<Revision | null>(null);
  const [suggestionPreview, setSuggestionPreview] = useState<{
    revisionId: string;
    oldText: string;
    newText: string;
    comment?: string;
    retryAction?: string;
    retryInstruction?: string;
    suggestAction?: string;
    suggestUnderstandingScope?: WritingUnderstandingScope;
    suggestEvaluation?: string;
    suggestRationale?: string;
  } | null>(null);
  const hasPendingSuggestion = suggestionRevision?.status === 'pending';
  const [sharing, setSharing] = useState(false);
  const [sharePayload, setSharePayload] = useState<ChapterSharePayload | null>(null);
  const shareCardRef = useRef<View>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantHeaderRead, setAssistantHeaderRead] = useState<AssistantHeaderReadAloud | null>(
    null,
  );
  const [assistantHeaderContext, setAssistantHeaderContext] =
    useState<AssistantHeaderContext | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrLoadingVisible, setOcrLoadingVisible] = useState(false);
  const [ocrConfirmVisible, setOcrConfirmVisible] = useState(false);
  const [ocrInsertWhereVisible, setOcrInsertWhereVisible] = useState(false);
  const [ocrInsertHowVisible, setOcrInsertHowVisible] = useState(false);
  const [ocrChapterPickerVisible, setOcrChapterPickerVisible] = useState(false);
  const [ocrPlacementActive, setOcrPlacementActive] = useState(false);
  const [ocrPlacementFlexible, setOcrPlacementFlexible] = useState(false);
  const [ocrPlacementTarget, setOcrPlacementTarget] = useState<OcrPlacementTarget | null>(
    null,
  );
  const [ocrDraft, setOcrDraft] = useState('');
  const [ocrLoadingMessage, setOcrLoadingMessage] = useState<string>(zh.writing.ocrRecognizing);

  const openAssistant = useCallback(() => {
    Keyboard.dismiss();
    setAssistantOpen(true);
  }, []);

  const closeAssistant = useCallback(() => {
    setAssistantOpen(false);
    setAssistantHeaderRead(null);
    void cancelAssistantFeedback();
  }, []);

  const loadDocumentsInit = useCallback(async () => {
    setInitLoading(true);
    setInitError(null);
    setInitErrorHint(undefined);
    try {
      const res = await api.listDocuments();
      const visible = filterVisibleDocuments(res.data);
      rememberTabs(visible.map((d) => ({ id: d.id, title: d.title })));
      if (visible.length === 0) {
        const created = await api.createDocument('我的文章');
        rememberDocument(created.data);
        setActiveId(created.data.id);
      } else {
        setActiveId((current) => {
          if (current && visible.some((d) => d.id === current)) return current;
          const fromRoute = route.params?.documentId;
          if (fromRoute && visible.some((d) => d.id === fromRoute)) return fromRoute;
          return visible[0]?.id ?? null;
        });
      }
    } catch (e) {
      const cached = getCachedTabs();
      if (cached.length > 0) {
        setActiveId((current) => current ?? cached[0]?.id ?? null);
      }
      const err = apiLoadErrorText(e);
      setInitError(err.message);
      setInitErrorHint(err.hint);
    } finally {
      setInitLoading(false);
    }
  }, [route.params?.documentId]);

  useReconnectEffect(() => {
    void loadDocumentsInit();
  }, [loadDocumentsInit]);

  const loadDoc = useCallback(async (id: string) => {
    setDocLoading(true);
    setDocError(null);
    setDocErrorHint(undefined);
    try {
      const res = await api.getDocument(id);
      rememberDocument(res.data);
      setDoc(res.data);
      setDocError(null);
    } catch (e) {
      const cached = getCachedDocument(id);
      if (cached) {
        setDoc(cached);
      } else {
        setDoc((prev) => (prev?.id === id ? prev : null));
      }
      const err = apiLoadErrorText(e);
      setDocError(err.message);
      setDocErrorHint(err.hint);
    } finally {
      setDocLoading(false);
    }
  }, []);

  useReconnectEffect(() => {
    if (activeId) void loadDoc(activeId);
  }, [activeId, loadDoc]);

  useEffect(() => {
    void loadDocumentsInit();
  }, [loadDocumentsInit]);

  useEffect(() => {
    const id = route.params?.documentId;
    if (id) setActiveId(id);
  }, [route.params?.documentId]);

  useEffect(() => {
    if (activeId) void loadDoc(activeId);
  }, [activeId, loadDoc]);

  const sortedChapters = useMemo(
    () => [...(doc?.chapters ?? [])].sort((a, b) => a.order - b.order),
    [doc?.chapters],
  );

  const activeChapter = useMemo(
    () => sortedChapters.find((ch) => ch.id === activeChapterId) ?? sortedChapters[0],
    [sortedChapters, activeChapterId],
  );

  const activeBlock = activeChapter?.blocks[0];

  const assistantChapterContext = useMemo(() => {
    if (!doc || !activeChapter) return null;
    return buildWritingAssistantChapterContext(doc, activeChapter.id, bodyDraft);
  }, [doc, activeChapter, bodyDraft]);

  useEffect(() => {
    if (!doc) {
      setActiveChapterId(null);
      return;
    }
    const sorted = [...doc.chapters].sort((a, b) => a.order - b.order);
    setActiveChapterId((current) => {
      if (current && sorted.some((ch) => ch.id === current)) return current;
      return sorted[0]?.id ?? null;
    });
  }, [doc?.id, doc?.chapters]);

  useEffect(() => {
    setBodyDraft(activeBlock?.content ?? '');
    setSelection({ start: 0, end: 0 });
  }, [activeChapter?.id, activeBlock?.id, activeBlock?.content]);

  const refreshSuggestionRevision = useCallback(async () => {
    if (!doc || !activeBlock) {
      setSuggestionRevision(null);
      return;
    }
    try {
      const res = await api.listRevisions(doc.id);
      const blockRevs = res.data.filter((r) => r.blockId === activeBlock.id);
      const pending = blockRevs.find((r) => r.status === 'pending');
      if (pending) {
        setSuggestionRevision(pending);
        return;
      }
      setSuggestionRevision((prev) => {
        if (prev && prev.blockId === activeBlock.id) {
          const inList = blockRevs.find((r) => r.id === prev.id);
          if (inList) return inList;
        }
        const sorted = [...blockRevs].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        return sorted[0] ?? null;
      });
    } catch {
      // 网络失败时保留本地缓存，便于离线再看一眼
    }
  }, [doc, activeBlock]);

  /** 回到写作页时刷新待查看建议；失败重试由 ReconnectBanner / LoadErrorView 手动触发，避免 docError 触发依赖死循环 */
  useFocusEffect(
    useCallback(() => {
      void refreshSuggestionRevision();
      return () => {
        void cancelAssistantFeedback();
        void stopSpeaking();
        setSpeaking(false);
        setReadHint(null);
      };
    }, [refreshSuggestionRevision]),
  );

  useEffect(() => {
    void refreshSuggestionRevision();
  }, [activeBlock?.id, refreshSuggestionRevision]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(undefined), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    return () => {
      void stopSpeaking();
    };
  }, []);

  const readingLabel = (mode: ReadPortionMode) => {
    if (mode === 'selection') return zh.writing.readingSelection;
    if (mode === 'fromCursor') return zh.writing.readingFromCursor;
    return zh.writing.reading;
  };

  const toggleReadAloud = async () => {
    if (!bodyDraft.trim()) {
      appAlert('提示', zh.writing.readEmpty);
      return;
    }
    if (await isSpeaking()) {
      await stopSpeaking();
      setSpeaking(false);
      setReadHint(null);
      return;
    }

    const portion = pickReadPortion(bodyDraft, selection);
    if (!portion.text.trim()) {
      appAlert('提示', zh.writing.readEmptyAfterCursor);
      return;
    }

    setSpeaking(true);
    setReadHint(readingLabel(portion.mode));
    try {
      await speakText(portion.text, {
        onDone: () => {
          setSpeaking(false);
          setReadHint(null);
        },
        onStopped: () => {
          setSpeaking(false);
          setReadHint(null);
        },
        onError: () => {
          setSpeaking(false);
          setReadHint(null);
        },
      });
    } catch {
      setSpeaking(false);
      setReadHint(null);
    }
  };

  const switchChapter = async (chapterId: string) => {
    if (chapterId === activeChapterId) return;
    await saveBody();
    setActiveChapterId(chapterId);
    void stopSpeaking();
    setSpeaking(false);
    setReadHint(null);
  };

  const handleAddChapter = async () => {
    if (!doc || addingChapter) return;
    if (doc.chapters.length >= 50) {
      appAlert('提示', zh.writing.chapterLimit);
      return;
    }
    await saveBody();
    setAddingChapter(true);
    try {
      const res = await api.addChapter(doc.id);
      let docData = res.data;
      const sorted = [...docData.chapters].sort((a, b) => a.order - b.order);
      const newest = sorted[sorted.length - 1];
      if (newest) {
        const { prefix } = parseChapterTitle(newest.title);
        const suffix = await promptText(
          zh.writing.newChapterSuffixTitle,
          `${zh.writing.newChapterSuffixMessage}\n\n${prefix}`,
          '',
        );
        if (suffix !== null && suffix.trim()) {
          const chapters = docData.chapters.map((c) =>
            c.id === newest.id
              ? { ...c, title: buildChapterTitle(prefix, suffix) }
              : c,
          );
          const renamed = await api.updateDocument(doc.id, { chapters });
          docData = renamed.data;
        }
        setActiveChapterId(newest.id);
      }
      rememberDocument(docData);
      setDoc(docData);
      setBodyDraft('');
      setSuggestionRevision(null);
    } catch (e) {
      appAlert('添加章节没成功', formatApiErrorAlertBody(e));
    } finally {
      setAddingChapter(false);
    }
  };

  useEffect(() => {
    if (!sharePayload) return;

    let cancelled = false;

    const run = async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
      if (cancelled) return;
      try {
        await saveChapterImageToAlbum(shareCardRef);
        appAlert('好了', zh.writing.shareImageSaved);
      } catch (e) {
        const msg = String(e);
        if (msg.includes('PERMISSION_DENIED')) {
          appAlert('提示', zh.writing.sharePermissionDenied);
        } else {
          appAlert('提示', zh.writing.shareImageFailed);
        }
      } finally {
        if (!cancelled) {
          setSharePayload(null);
          setSharing(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [sharePayload]);

  const buildSharePayload = (): ChapterSharePayload | null => {
    if (!doc || !activeChapter) return null;
    const text = bodyDraft.trim();
    if (!text) return null;
    return {
      documentTitle: doc.title,
      chapterTitle: activeChapter.title,
      body: text,
    };
  };

  const prepareSharePayload = async (): Promise<ChapterSharePayload | null> => {
    if (!doc || !activeChapter || sharing) return null;
    await saveBody();
    const payload = buildSharePayload();
    if (!payload) {
      appAlert('提示', zh.writing.shareEmpty);
      return null;
    }
    return payload;
  };

  const handleCopyChapter = () => {
    void (async () => {
      const payload = await prepareSharePayload();
      if (!payload) return;
      try {
        await copyChapterText(payload);
        appAlert('好了', zh.writing.shareCopyDone);
      } catch {
        appAlert('提示', '复制没成功，请稍后再试');
      }
    })();
  };

  const handleGenerateChapterImage = () => {
    void (async () => {
      const payload = await prepareSharePayload();
      if (!payload) return;
      try {
        await ensureSaveToAlbumPermission();
        setSharing(true);
        setSharePayload(payload);
      } catch {
        appAlert('提示', zh.writing.sharePermissionDenied);
      }
    })();
  };

  const persistBody = async (content: string) => {
    if (!doc || !activeChapter || !activeBlock || saving) return;
    if (content === activeBlock.content) return;
    setSaving(true);
    try {
      const chapters = doc.chapters.map((ch) =>
        ch.id !== activeChapter.id
          ? ch
          : {
              ...ch,
              blocks: ch.blocks.map((b) =>
                b.id === activeBlock.id ? { ...b, content } : b,
              ),
            },
      );
      const res = await api.updateDocument(doc.id, { chapters });
      setDoc(res.data);
    } catch (e) {
      appAlert('保存没成功', formatApiErrorAlertBody(e));
    } finally {
      setSaving(false);
    }
  };

  const saveBody = async () => {
    await persistBody(bodyDraft);
  };

  const renameArticleTitle = async () => {
    if (!doc) return;
    const next = await promptText(
      zh.writing.renameDocTitle,
      zh.writing.renameDocMessage,
      doc.title,
    );
    if (next === null || next === doc.title) return;
    if (!next.trim()) {
      appAlert(zh.writing.renameDocEmpty, zh.writing.renameDocMessage);
      return;
    }
    try {
      const res = await api.updateDocument(doc.id, { title: next.trim() });
      rememberDocument(res.data);
      setDoc(res.data);
    } catch (e) {
      appAlert('改名没成功', formatApiErrorAlertBody(e));
    }
  };

  const renameChapter = async (chapterId: string) => {
    if (!doc) return;
    const ch = doc.chapters.find((c) => c.id === chapterId);
    if (!ch) return;
    const { prefix, suffix } = parseChapterTitle(ch.title);
    const hint = prefix
      ? `${zh.writing.renameChapterPrefixHint}\n\n当前：${ch.title}`
      : zh.writing.renameChapterMessage;
    const nextSuffix = await promptText(zh.writing.renameChapterTitle, hint, suffix);
    if (nextSuffix === null) return;
    const newTitle = prefix
      ? buildChapterTitle(prefix, nextSuffix)
      : nextSuffix.trim() || ch.title;
    if (newTitle === ch.title) return;
    try {
      const chapters = doc.chapters.map((c) =>
        c.id === chapterId ? { ...c, title: newTitle } : c,
      );
      const res = await api.updateDocument(doc.id, { chapters });
      rememberDocument(res.data);
      setDoc(res.data);
    } catch (e) {
      appAlert('章节改名没成功', formatApiErrorAlertBody(e));
    }
  };

  const clearOcrDraftFlow = useCallback(() => {
    setOcrConfirmVisible(false);
    setOcrInsertWhereVisible(false);
    setOcrInsertHowVisible(false);
    setOcrChapterPickerVisible(false);
    setOcrPlacementActive(false);
    setOcrPlacementFlexible(false);
    setOcrPlacementTarget(null);
    setOcrDraft('');
  }, []);

  const cancelOcrPlacement = useCallback(() => {
    setOcrPlacementActive(false);
    setOcrPlacementFlexible(false);
    setOcrPlacementTarget(null);
    setOcrInsertWhereVisible(true);
  }, []);

  const persistChapterContent = async (
    documentId: string,
    chapterId: string,
    blockId: string,
    nextContent: string,
  ): Promise<Document | null> => {
    const fresh = await api.getDocument(documentId);
    const sourceDoc = fresh.data;
    const chapter = sourceDoc.chapters.find((c) => c.id === chapterId);
    const block = chapter?.blocks.find((b) => b.id === blockId);
    if (!chapter || !block) return null;
    const chapters = sourceDoc.chapters.map((ch) =>
      ch.id !== chapterId
        ? ch
        : {
            ...ch,
            blocks: ch.blocks.map((b) =>
              b.id === blockId ? { ...b, content: nextContent } : b,
            ),
          },
    );
    const res = await api.updateDocument(documentId, { chapters });
    return res.data;
  };

  const beginOcrPlacement = (
    opts: { flexible: boolean; target?: OcrPlacementTarget | null },
    cursorAt: number,
  ) => {
    setOcrInsertWhereVisible(false);
    setOcrInsertHowVisible(false);
    setOcrChapterPickerVisible(false);
    setOcrPlacementFlexible(opts.flexible);
    setOcrPlacementTarget(opts.flexible ? null : (opts.target ?? null));
    setOcrPlacementActive(true);
    setSelection({ start: cursorAt, end: cursorAt });
  };

  const startOcrPlacement = async (
    opts: { flexible: boolean; target?: OcrPlacementTarget | null },
    cursorAt?: number,
  ) => {
    await saveBody();
    beginOcrPlacement(opts, cursorAt ?? bodyDraft.length);
  };

  const runOcrRecognition = useCallback(async (assets: PickedOcrImage[]) => {
    if (assets.length === 0) return;
    setOcrLoadingVisible(true);
    const parts: string[] = [];
    try {
      for (let i = 0; i < assets.length; i++) {
        const total = assets.length;
        setOcrLoadingMessage(
          total > 1
            ? zh.writing.ocrRecognizingNth
                .replace('{current}', String(i + 1))
                .replace('{total}', String(total))
            : zh.writing.ocrRecognizing,
        );
        const text = (await recognizeImageFromAsset(assets[i]!)).trim();
        if (text) parts.push(text);
      }
      if (parts.length === 0) {
        appAlert('提示', zh.writing.ocrEmpty);
        return;
      }
      setOcrDraft(parts.join('\n\n'));
      setOcrConfirmVisible(true);
    } catch (e) {
      const { message, hint } = apiErrorText(e);
      appAlert('识图没成功', hint ? `${message}\n\n${hint}` : message);
    } finally {
      setOcrLoadingVisible(false);
      setOcrLoadingMessage(zh.writing.ocrRecognizing);
      setOcrBusy(false);
    }
  }, []);

  const startAssistantOcr = useCallback(() => {
    if (ocrBusy) return;
    promptAssistantOcrImages((source) => {
      void (async () => {
        setOcrBusy(true);
        setAssistantOpen(false);
        await new Promise((r) => setTimeout(r, 380));
        try {
          const picked = await pickAssistantOcrImagesFromSource(source);
          if (!picked.length) {
            setOcrBusy(false);
            return;
          }
          await runOcrRecognition(picked);
        } catch (e) {
          appAlert('识图没成功', formatApiErrorAlertBody(e));
          setOcrBusy(false);
        }
      })();
    });
  }, [ocrBusy, runOcrRecognition]);

  const proceedOcrToInsertWhere = () => {
    if (!ocrDraft.trim()) {
      appAlert('提示', zh.writing.ocrConfirmEmpty);
      return;
    }
    setOcrConfirmVisible(false);
    setOcrInsertWhereVisible(true);
  };

  const backOcrToConfirm = () => {
    setOcrInsertWhereVisible(false);
    setOcrInsertHowVisible(false);
    setOcrChapterPickerVisible(false);
    setOcrConfirmVisible(true);
  };

  const finishOcrInsert = (message: string) => {
    clearOcrDraftFlow();
    appAlert('好了', message);
  };

  const handleOcrInsertCurrent = () => {
    if (!doc || !activeChapter || !activeBlock) return;
    void startOcrPlacement({
      flexible: false,
      target: {
        documentId: doc.id,
        chapterId: activeChapter.id,
        blockId: activeBlock.id,
      },
    });
  };

  const handleOcrPickOtherChapter = async (chapterId: string) => {
    if (!doc) return;
    const ch = doc.chapters.find((c) => c.id === chapterId);
    const block = ch?.blocks[0];
    if (!ch || !block) return;
    setOcrChapterPickerVisible(false);
    await switchChapter(chapterId);
    const fresh = await api.getDocument(doc.id);
    const freshCh = fresh.data.chapters.find((c) => c.id === chapterId);
    const content = freshCh?.blocks[0]?.content ?? '';
    setBodyDraft(content);
    beginOcrPlacement(
      {
        flexible: false,
        target: { documentId: doc.id, chapterId: ch.id, blockId: block.id },
      },
      content.length,
    );
  };

  const handleOcrCreateChapterForPlacement = async () => {
    if (!doc || addingChapter) return;
    if (doc.chapters.length >= 50) {
      appAlert('提示', zh.writing.chapterLimit);
      return;
    }
    setOcrInsertHowVisible(false);
    await saveBody();
    setAddingChapter(true);
    try {
      const res = await api.addChapter(doc.id);
      let docData = res.data;
      const sorted = [...docData.chapters].sort((a, b) => a.order - b.order);
      const newest = sorted[sorted.length - 1];
      if (!newest) return;

      const { prefix } = parseChapterTitle(newest.title);
      const suffix = await promptText(
        zh.writing.newChapterSuffixTitle,
        `${zh.writing.newChapterSuffixMessage}\n\n${prefix}`,
        '',
      );
      if (suffix !== null && suffix.trim()) {
        const chapters = docData.chapters.map((c) =>
          c.id === newest.id ? { ...c, title: buildChapterTitle(prefix, suffix) } : c,
        );
        const renamed = await api.updateDocument(doc.id, { chapters });
        docData = renamed.data;
      }
      rememberDocument(docData);
      setDoc(docData);
      await switchChapter(newest.id);
      setSuggestionRevision(null);
      beginOcrPlacement({ flexible: true }, 0);
    } catch (e) {
      appAlert('添加章节没成功', formatApiErrorAlertBody(e));
      setOcrInsertHowVisible(true);
    } finally {
      setAddingChapter(false);
    }
  };

  const handleOcrCreateArticleForPlacement = async () => {
    if (creating) return;
    setOcrInsertHowVisible(false);
    await saveBody();
    setCreating(true);
    try {
      const res = await api.createDocument('新文稿');
      let docData = res.data;
      const prompted = await promptText(
        zh.writing.renameDocTitle,
        zh.writing.renameDocMessage,
        '新文稿',
      );
      if (prompted !== null && prompted.trim() && prompted.trim() !== '新文稿') {
        const renamed = await api.updateDocument(docData.id, { title: prompted.trim() });
        docData = renamed.data;
      }
      setActiveId(docData.id);
      setDoc(docData);
      rememberDocument(docData);
      const first = [...docData.chapters].sort((a, b) => a.order - b.order)[0];
      setActiveChapterId(first?.id ?? null);
      setBodyDraft(first?.blocks[0]?.content ?? '');
      void stopSpeaking();
      setSpeaking(false);
      beginOcrPlacement({ flexible: true }, first?.blocks[0]?.content.length ?? 0);
    } catch (e) {
      const { message, hint } = apiErrorText(e);
      appAlert(zh.writing.newDocFailed, hint ? `${message}\n\n${hint}` : message);
      setOcrInsertHowVisible(true);
    } finally {
      setCreating(false);
    }
  };

  const confirmOcrPlacement = async () => {
    const text = ocrDraft.trim();
    if (!text) {
      appAlert('提示', zh.writing.ocrConfirmEmpty);
      return;
    }
    if (!doc || !activeChapter || !activeBlock) return;

    let target: OcrPlacementTarget;
    if (ocrPlacementFlexible) {
      target = {
        documentId: doc.id,
        chapterId: activeChapter.id,
        blockId: activeBlock.id,
      };
    } else if (ocrPlacementTarget) {
      if (
        doc.id !== ocrPlacementTarget.documentId ||
        activeChapter.id !== ocrPlacementTarget.chapterId ||
        activeBlock.id !== ocrPlacementTarget.blockId
      ) {
        appAlert('提示', zh.writing.ocrPlacementWrongChapter);
        return;
      }
      target = ocrPlacementTarget;
    } else {
      return;
    }

    const offset = Math.min(selection.start, selection.end);

    try {
      const nextContent = insertTextAtOffset(bodyDraft, offset, text);
      setBodyDraft(nextContent);
      const updated = await persistChapterContent(
        target.documentId,
        target.chapterId,
        target.blockId,
        nextContent,
      );
      if (updated) {
        rememberDocument(updated);
        setDoc(updated);
      }
      finishOcrInsert(zh.writing.ocrInsertDone);
    } catch (e) {
      appAlert('插入没成功', formatApiErrorAlertBody(e));
    }
  };

  const ocrPlacementHint = ocrPlacementFlexible
    ? zh.writing.ocrPlacementHintFlexible
    : ocrPlacementTarget
      ? zh.writing.ocrPlacementHintChapter
      : zh.writing.ocrPlacementHintCurrent;

  const ocrPlacementTargetLabel =
    ocrPlacementFlexible && doc && activeChapter
      ? `${zh.writing.ocrPlacementTarget}${doc.title} · ${activeChapter.title}`
      : ocrPlacementTarget && doc
        ? (() => {
            const ch = doc.chapters.find((c) => c.id === ocrPlacementTarget.chapterId);
            return ch ? `${zh.writing.ocrPlacementTarget}${doc.title} · ${ch.title}` : undefined;
          })()
        : undefined;

  const assistantFabBottom = Math.max(insets.bottom, 12) + 8;
  const bodyInputScrollPadding = assistantFabBottom + 76;

  const openDocumentLibrary = useCallback(() => {
    navigation.navigate('DocumentLibrary', { currentDocumentId: doc?.id });
  }, [navigation, doc?.id]);

  const tabNav = useMemo(() => {
    let parent = navigation.getParent();
    for (let i = 0; i < 4 && parent; i++) {
      const state = parent.getState();
      if (state?.type === 'tab') {
        return parent as BottomTabNavigationProp<RootTabParamList>;
      }
      parent = parent.getParent();
    }
    return navigation.getParent<BottomTabNavigationProp<RootTabParamList>>();
  }, [navigation]);

  const assistantGuideNav = useMemo((): AssistantGuideNav | undefined => {
    if (!doc || !tabNav) return undefined;
    return {
      tabNav,
      writingNav: navigation,
      documentId: doc.id,
      documentTitle: doc.title,
      onRenameTitle: () => void renameArticleTitle(),
      onShareImage: () => void handleGenerateChapterImage(),
      onCopyChapter: () => void handleCopyChapter(),
    };
  }, [doc, tabNav, navigation]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <TabletFrame variant="page" style={styles.frame}>
      <View style={styles.mainColumn}>
      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {initError && !activeId ? (
        <LoadErrorView
          message={initError}
          hint={initErrorHint}
          onRetry={() => void loadDocumentsInit()}
        />
      ) : docError && !doc ? (
        <LoadErrorView
          message={docError}
          hint={docErrorHint}
          onRetry={() => {
            if (activeId) void loadDoc(activeId);
            else void loadDocumentsInit();
          }}
        />
      ) : doc ? (
        <>
        <KeyboardAvoidingView
          style={styles.editorKeyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
        <View style={styles.workArea}>
          {initError || docError ? (
            <ReconnectBanner
              message={initError ?? docError ?? ''}
              hint={initErrorHint ?? docErrorHint}
              onRetry={() => {
                void loadDocumentsInit();
                if (activeId) void loadDoc(activeId);
              }}
            />
          ) : null}
          <View style={styles.editorPane}>
            {editorChromeCollapsed ? (
              <Pressable
                style={styles.chromePeek}
                onPress={expandChrome}
                accessibilityRole="button"
                accessibilityLabel={zh.writing.expandChrome}
              >
                <Text style={styles.chromePeekLabel} numberOfLines={1}>
                  {doc.title}
                  {activeChapter ? ` · ${activeChapter.title}` : ''}
                </Text>
                <Text style={styles.chromePeekAction}>{zh.writing.expandChrome}</Text>
              </Pressable>
            ) : (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.toolbarScroll}
                  contentContainerStyle={styles.toolbarRow}
                  keyboardShouldPersistTaps="handled"
                >
                  <WritingToolbarChip
                    label={zh.writing.shareCopyText}
                    onPress={() => void handleCopyChapter()}
                    disabled={sharing}
                    fontSize={chromeFontSize}
                    lineHeight={chromeLineHeight}
                  />
                  <WritingToolbarChip
                    label={zh.writing.shareGenerateImage}
                    onPress={() => void handleGenerateChapterImage()}
                    disabled={sharing}
                    loading={sharing}
                    fontSize={chromeFontSize}
                    lineHeight={chromeLineHeight}
                  />
                  <WritingToolbarChip
                    label={zh.writing.newArticle}
                    onPress={openDocumentLibrary}
                    disabled={creating}
                    fontSize={chromeFontSize}
                    lineHeight={chromeLineHeight}
                  />
                  <WritingToolbarChip
                    label={speaking ? zh.writing.stopReading : zh.writing.readMode}
                    onPress={() => void toggleReadAloud()}
                    active={speaking}
                    tone="light"
                    fontSize={chromeFontSize}
                    lineHeight={chromeLineHeight}
                  />
                </ScrollView>

                <View style={styles.chapterTitleRow}>
                  <Text style={styles.chapterTitleText} numberOfLines={2}>
                    {doc.title}
                  </Text>
                  {!speaking && bodyDraft.trim() ? (
                    <Text style={styles.readCursorHint} numberOfLines={2}>
                      {zh.writing.readCursorHint}
                    </Text>
                  ) : null}
                  <View style={styles.chapterTitleActions}>
                    <WritingToolbarChip
                      label={zh.writing.renameArticleTitle}
                      onPress={() => void renameArticleTitle()}
                      fontSize={chromeFontSize}
                      lineHeight={chromeLineHeight}
                    />
                    <WritingToolbarChip
                      label={zh.writing.history}
                      onPress={() =>
                        navigation.navigate('RevisionHistory', {
                          documentId: doc.id,
                          title: doc.title,
                        })
                      }
                      fontSize={chromeFontSize}
                      lineHeight={chromeLineHeight}
                    />
                  </View>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.chapterBar}
                  contentContainerStyle={styles.chapterBarContent}
                  keyboardShouldPersistTaps="handled"
                >
                  {sortedChapters.map((ch) => (
                    <Pressable
                      key={ch.id}
                      style={[
                        styles.chapterTab,
                        activeChapter?.id === ch.id && styles.chapterTabActive,
                      ]}
                      onPress={() => void switchChapter(ch.id)}
                      onLongPress={() => void renameChapter(ch.id)}
                      delayLongPress={RENAME_LONG_PRESS_MS}
                    >
                      <Text
                        style={[
                          styles.chapterTabText,
                          { fontSize: chromeFontSize, lineHeight: chromeLineHeight },
                          activeChapter?.id === ch.id && styles.chapterTabTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {ch.title}
                      </Text>
                    </Pressable>
                  ))}
                  <Pressable
                    style={[styles.chapterAdd, addingChapter && styles.chapterAddDisabled]}
                    onPress={() => void handleAddChapter()}
                    disabled={addingChapter}
                    hitSlop={8}
                  >
                    <Text
                      style={[
                        styles.chapterAddText,
                        { fontSize: chromeFontSize, lineHeight: chromeLineHeight },
                      ]}
                    >
                      ＋ {addingChapter ? zh.writing.addingChapter : zh.writing.addChapter}
                    </Text>
                  </Pressable>
                </ScrollView>
              </>
            )}

            <View style={styles.bodyInputWrap}>
              <AppTextInput
                style={[
                  styles.bodyInput,
                  isTablet && styles.bodyInputTablet,
                  ocrPlacementActive && styles.bodyInputPlacement,
                  {
                    fontSize: bodyFontSize,
                    lineHeight: bodyLineHeight,
                    paddingBottom:
                      activeBlock && !assistantOpen && !ocrPlacementActive
                        ? bodyInputScrollPadding
                        : 16,
                  },
                ]}
                placeholder={zh.writing.bodyPlaceholder}
                placeholderTextColor={colors.textMuted}
                value={bodyDraft}
                onChangeText={setBodyDraft}
                onSelectionChange={(e) => {
                  setSelection(e.nativeEvent.selection);
                }}
                onFocus={onInputFocus}
                onBlur={() => {
                  onInputBlur();
                  void saveBody();
                }}
                multiline
                scrollEnabled
                editable
                textAlignVertical="top"
              />
              {activeBlock && !assistantOpen && !ocrPlacementActive ? (
                <Pressable
                  style={[
                    styles.assistantFab,
                    { bottom: assistantFabBottom },
                    hasPendingSuggestion ? styles.assistantFabPending : null,
                  ]}
                  onPress={openAssistant}
                  accessibilityRole="button"
                  accessibilityLabel={zh.writing.openAssistant}
                >
                  <Text style={styles.assistantFabText}>{zh.writing.assistantTitle}</Text>
                  {hasPendingSuggestion ? <View style={styles.assistantFabBadge} /> : null}
                </Pressable>
              ) : null}
            </View>
            {ocrPlacementActive ? (
              <OcrPlacementBar
                hint={ocrPlacementHint}
                targetLabel={ocrPlacementTargetLabel}
                onCancel={cancelOcrPlacement}
                onConfirm={() => void confirmOcrPlacement()}
              />
            ) : null}
            {speaking && readHint ? (
              <Text style={styles.readingHint}>{readHint}</Text>
            ) : null}
          </View>
        </View>
        </KeyboardAvoidingView>

        {activeBlock && assistantChapterContext && assistantOpen ? (
          <WritingAssistantSheet
            visible
            title={zh.writing.assistantTitle}
            closeLabel={zh.writing.assistantClose}
            onClose={closeAssistant}
            headerReadAloud={assistantHeaderRead}
            headerContext={assistantHeaderContext}
          >
            <WritingAssistantPanel
              showTitle={false}
              autoFocusCompose
              onHeaderReadAloud={setAssistantHeaderRead}
              onHeaderContext={setAssistantHeaderContext}
              documentId={doc.id}
              blockId={activeBlock.id}
              ocrBusy={ocrBusy}
              onStartOcr={() => void startAssistantOcr()}
              articleExcerpt={bodyDraft.slice(0, 2000)}
              chapterContext={assistantChapterContext}
              scrollToLatestOnOpen={assistantOpen}
              guideNav={assistantGuideNav}
              onViewRevision={async (revisionId: string, hint?: Revision) => {
                if (!activeBlock) {
                  appAlert(zh.common.loadFailed);
                  return;
                }
                closeAssistant();
                try {
                  await waitForAssistantModalDismiss();
                  const { revision: rev, allRevisions } = await resolveRevisionForView({
                    documentId: doc.id,
                    revisionId,
                    blockId: activeBlock.id,
                    hint,
                    suggestionRevision,
                    suggestionPreview,
                  });
                  if (!rev) {
                    appAlert(zh.common.loadFailed);
                    return;
                  }
                  const { viewOnly, reason } = resolveSuggestionViewPolicy(
                    rev,
                    allRevisions,
                    activeBlock.id,
                  );
                  const cached =
                    suggestionPreview?.revisionId === rev.id ? suggestionPreview : null;
                  openDiffPreview(navigation, doc.id, rev, {
                    oldText: cached?.oldText ?? rev.previousSnapshot ?? '',
                    newText: cached?.newText ?? rev.snapshot ?? '',
                    comment: cached?.comment ?? rev.summary,
                    retryAction: cached?.retryAction ?? rev.suggestAction ?? '润色',
                    retryInstruction:
                      cached?.retryInstruction ?? rev.suggestInstruction ?? '',
                    suggestAction: cached?.suggestAction ?? rev.suggestAction,
                    suggestUnderstandingScope:
                      cached?.suggestUnderstandingScope ??
                      rev.suggestUnderstandingScope,
                    suggestEvaluation:
                      cached?.suggestEvaluation ?? rev.suggestEvaluation,
                    suggestRationale: cached?.suggestRationale ?? rev.suggestRationale,
                    viewOnly,
                    viewOnlyReason: reason,
                  });
                } catch (e) {
                  const err = e as Error & { hint?: string };
                  appAlert(err.message, err.hint);
                }
              }}
              onBeforeExecute={saveBody}
              onRevisionReady={(result) => {
                clientLog('ai.revision.ready', { documentId: doc.id });
                const newText =
                  result.newText?.trim() || result.revision.snapshot?.trim() || '';
                setSuggestionRevision(result.revision);
                setSuggestionPreview({
                  revisionId: result.revision.id,
                  oldText: result.oldText,
                  newText,
                  comment: result.comment,
                  retryAction: result.retryAction,
                  retryInstruction: result.retryInstruction,
                  suggestAction: result.suggestAction,
                  suggestUnderstandingScope: result.suggestUnderstandingScope,
                  suggestEvaluation: result.suggestEvaluation,
                  suggestRationale: result.suggestRationale,
                });
              }}
            />
          </WritingAssistantSheet>
        ) : null}
        </>
      ) : (
        <View style={styles.center}>
          <Text style={styles.empty}>
            {initLoading || docLoading ? zh.common.loading : zh.common.loadFailed}
          </Text>
        </View>
      )}
      </View>
      </TabletFrame>

      <OcrLoadingModal visible={ocrLoadingVisible} message={ocrLoadingMessage} />

      <OcrConfirmModal
        visible={ocrConfirmVisible}
        draft={ocrDraft}
        onChangeDraft={setOcrDraft}
        onClose={clearOcrDraftFlow}
        onNext={proceedOcrToInsertWhere}
      />

      <OcrOptionModal
        visible={ocrInsertWhereVisible}
        title={zh.writing.ocrInsertWhereTitle}
        hint={zh.writing.ocrInsertWhereHint}
        options={[
          {
            key: 'current',
            label: activeChapter
              ? `${zh.writing.ocrInsertCurrent}（${activeChapter.title}）`
              : zh.writing.ocrInsertCurrent,
            primary: true,
          },
          { key: 'elsewhere', label: zh.writing.ocrInsertElsewhere },
        ]}
        onSelect={(key) => {
          if (key === 'current') handleOcrInsertCurrent();
          else {
            setOcrInsertWhereVisible(false);
            setOcrInsertHowVisible(true);
          }
        }}
        onClose={backOcrToConfirm}
      />

      <OcrOptionModal
        visible={ocrInsertHowVisible}
        title={zh.writing.ocrInsertHowTitle}
        hint={zh.writing.ocrInsertHowHint}
        options={[
          { key: 'chapter', label: zh.writing.ocrInsertPickChapter, primary: true },
          { key: 'newChapter', label: zh.writing.ocrInsertNewChapter },
          { key: 'newArticle', label: zh.writing.ocrInsertNewArticle },
        ]}
        onSelect={(key) => {
          if (key === 'chapter') {
            setOcrInsertHowVisible(false);
            setOcrChapterPickerVisible(true);
          } else if (key === 'newChapter') {
            void handleOcrCreateChapterForPlacement();
          } else {
            void handleOcrCreateArticleForPlacement();
          }
        }}
        onClose={() => {
          setOcrInsertHowVisible(false);
          setOcrInsertWhereVisible(true);
        }}
      />

      <OcrChapterPickerModal
        visible={ocrChapterPickerVisible}
        chapters={sortedChapters.map((ch) => ({ id: ch.id, title: ch.title }))}
        activeChapterId={activeChapterId}
        onClose={() => {
          setOcrChapterPickerVisible(false);
          setOcrInsertHowVisible(true);
        }}
        onSelect={(chapterId) => void handleOcrPickOtherChapter(chapterId)}
      />

      {sharePayload ? (
        <View style={styles.shareCaptureHost} pointerEvents="none">
          <View ref={shareCardRef} collapsable={false}>
            <ChapterShareCard
              documentTitle={sharePayload.documentTitle}
              chapterTitle={sharePayload.chapterTitle}
              body={sharePayload.body}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  frame: { flex: 1 },
  mainColumn: { flex: 1, minHeight: 0 },
  editorKeyboard: { flex: 1, minHeight: 0 },
  workArea: { flex: 1, minHeight: 0, position: 'relative' },
  editorPane: { flex: 1, minHeight: 0 },
  bodyInputWrap: { flex: 1, minHeight: 0, position: 'relative' },
  assistantFab: {
    position: 'absolute',
    right: 16,
    minWidth: 72,
    minHeight: 72,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 10,
  },
  assistantFabPending: {
    borderWidth: 2,
    borderColor: colors.insertBorder,
  },
  assistantFabText: {
    fontSize: typography.button,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  assistantFabBadge: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.insertBorder,
    borderWidth: 1,
    borderColor: colors.onPrimary,
  },
  chromePeek: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    minHeight: 32,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  chromePeekLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: typography.caption,
    fontWeight: '600',
    color: colors.text,
  },
  chromePeekAction: {
    fontSize: typography.caption,
    fontWeight: '600',
    color: colors.primary,
  },
  toolbarScroll: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  toolbarChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbarChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toolbarChipDisabled: { opacity: 0.55 },
  toolbarChipLight: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  toolbarChipText: {
    fontWeight: '600',
    color: colors.primaryMutedText,
  },
  toolbarChipLightText: {
    color: colors.textMuted,
    fontWeight: '500',
  },
  toolbarChipTextActive: { color: colors.onPrimary },
  chapterBar: {
    maxHeight: 44,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chapterBarContent: { paddingHorizontal: 4, alignItems: 'center', gap: 4, paddingVertical: 2 },
  chapterTab: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.surface,
    marginVertical: 1,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  chapterTabActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  chapterTabText: {
    color: colors.textMuted,
  },
  chapterTabTextActive: { color: colors.text, fontWeight: '600' },
  chapterAdd: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    marginVertical: 1,
    justifyContent: 'center',
  },
  chapterAddDisabled: { opacity: 0.6 },
  chapterAddText: { color: colors.primary, fontWeight: '600' },
  toast: {
    backgroundColor: colors.insertBg,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  toastText: { fontSize: typography.caption, color: colors.text, textAlign: 'center' },
  chapterTitleRow: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chapterTitleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  chapterTitleText: {
    fontSize: typography.title,
    fontWeight: '700',
    color: colors.text,
    lineHeight: Math.round(typography.title * 1.3),
  },
  shareCaptureHost: {
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0.02,
    zIndex: -1,
  },
  readCursorHint: {
    fontSize: typography.small,
    color: colors.textMuted,
    lineHeight: 24,
  },
  readingHint: {
    fontSize: typography.caption,
    color: colors.primary,
    marginTop: 8,
    marginHorizontal: 4,
  },
  bodyInput: {
    flex: 1,
    width: '100%',
    marginTop: 4,
    padding: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 200,
  },
  bodyInputTablet: { marginTop: 12, minHeight: 280, padding: 20 },
  bodyInputPlacement: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  meta: { fontSize: typography.caption, color: colors.textMuted, marginTop: 20 },
  metaFooter: { fontSize: typography.caption, color: colors.textMuted },
  savingHint: { fontSize: typography.caption, color: colors.primary, textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { fontSize: typography.body, color: colors.textMuted },
});
