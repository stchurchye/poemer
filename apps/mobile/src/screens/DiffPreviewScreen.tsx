import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { computeDiff, type Revision } from '@shiren/shared';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { appAlert } from '../lib/appAlert';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTextInput } from '../components/AppTextInput';
import { DiffView } from '../components/DiffView';
import { PrimaryButton } from '../components/PrimaryButton';
import { TabletFrame } from '../components/TabletFrame';
import { colors, typography } from '../theme/colors';
import { useLayout, useTypography } from '../theme/layout';
import { zh } from '../locales/zh-CN';
import type { WritingStackParamList } from '../navigation/types';
import { api } from '../lib/api';
import { apiErrorText } from '../lib/apiError';
import { clientLog } from '../lib/clientLog';
import {
  resolveSuggestionViewPolicy,
  suggestionViewOnlyHint,
} from '../lib/suggestionViewOnly';
import { leaveDiffPreview, openDiffPreview } from '../lib/openDiffPreview';

type Props = NativeStackScreenProps<WritingStackParamList, 'DiffPreview'>;

type FocusSection = 'diff' | 'edit';

/** 展开 : 收起 = 14 : 1，并配合 minHeight 保证标题栏可点 */
const SECTION_FLEX = { active: 14, inactive: 1 } as const;
const SECTION_COLLAPSED_MIN_HEIGHT = 96;

const SECTION_SPRING = {
  damping: 26,
  stiffness: 210,
  mass: 0.9,
  useNativeDriver: false as const,
};

function FocusSectionPanel({
  section,
  focus,
  onFocus,
  title,
  labelSize,
  labelLineHeight,
  highlightActive = true,
  children,
}: {
  section: FocusSection;
  focus: FocusSection;
  onFocus: (s: FocusSection) => void;
  title: string;
  labelSize: number;
  labelLineHeight: number;
  /** 棕色高亮仅表示可编辑；只读查看时不高亮 */
  highlightActive?: boolean;
  children: ReactNode;
}) {
  const active = focus === section;
  const emphasized = active && highlightActive;
  const flexAnim = useRef(
    new Animated.Value(active ? SECTION_FLEX.active : SECTION_FLEX.inactive),
  ).current;
  const bodyFlexAnim = useRef(new Animated.Value(active ? 1 : 0)).current;
  const bodyOpacity = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(flexAnim, {
        ...SECTION_SPRING,
        toValue: active ? SECTION_FLEX.active : SECTION_FLEX.inactive,
      }),
      Animated.spring(bodyFlexAnim, {
        ...SECTION_SPRING,
        toValue: active ? 1 : 0,
      }),
      Animated.timing(bodyOpacity, {
        toValue: active ? 1 : 0,
        duration: active ? 280 : 200,
        easing: active ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [active, flexAnim, bodyFlexAnim, bodyOpacity]);

  return (
    <Animated.View
      style={[
        styles.sectionPanel,
        { flex: flexAnim },
        emphasized && styles.sectionPanelActive,
        !active && styles.sectionPanelCollapsed,
        active && !highlightActive && styles.sectionPanelReadOnly,
      ]}
    >
      <Pressable
        style={[
          styles.sectionHeader,
          !active && styles.sectionHeaderCollapsed,
        ]}
        onPress={() => onFocus(section)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={
          active ? title : `${title}，${zh.diff.sectionTapToExpand}`
        }
      >
        <View
          style={[
            styles.sectionHeaderRow,
            !active && styles.sectionHeaderRowCollapsed,
          ]}
        >
          <Text
            style={[
              styles.panelLabel,
              { fontSize: labelSize, lineHeight: labelLineHeight },
              emphasized && styles.panelLabelActive,
              active && !highlightActive && styles.panelLabelReadOnly,
              !active && styles.panelLabelCollapsed,
            ]}
          >
            {title}
          </Text>
          {!active ? (
            <View style={styles.expandHintButton}>
              <Text
                style={[
                  styles.expandHint,
                  {
                    fontSize: Math.round(labelSize * 1.12),
                    lineHeight: Math.round(labelLineHeight * 1.08),
                  },
                ]}
              >
                {zh.diff.sectionTapToExpand}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      <Animated.View
        style={[styles.sectionBody, { flex: bodyFlexAnim }]}
        pointerEvents={active ? 'auto' : 'none'}
      >
        <Animated.View style={[styles.sectionBodyInner, { opacity: bodyOpacity }]}>
          {children}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

export function DiffPreviewScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { isTablet } = useLayout();
  const { bodyFontSize, bodyLineHeight, buttonFontSize } = useTypography('article');
  const {
    documentId,
    revisionId,
    blockId,
    oldText,
    newText,
    comment,
    retryAction = '润色',
    retryInstruction = '',
    feedbackHistory = [],
    viewOnly = false,
    viewOnlyReason,
  } = route.params;
  /** 加载完成前不用棕色，避免已拒绝仍显示可编辑 */
  const [canEdit, setCanEdit] = useState(false);
  const [viewOnlyReasonResolved, setViewOnlyReasonResolved] = useState(viewOnlyReason);
  const viewOnlyHintText = !canEdit
    ? suggestionViewOnlyHint(viewOnlyReasonResolved)
    : '';
  const [editedText, setEditedText] = useState(newText ?? '');
  const [resolvedOldText, setResolvedOldText] = useState(oldText ?? '');
  const [revisionLoading, setRevisionLoading] = useState(true);
  const [retryInput, setRetryInput] = useState('');
  const [retryPanelOpen, setRetryPanelOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [diffBaseText, setDiffBaseText] = useState(newText ?? '');
  const [focusSection, setFocusSection] = useState<FocusSection>('diff');
  const busy = retrying || accepting;
  /** 仅用户手改建议正文时才防抖更新 diff，避免覆盖服务端加载结果 */
  const diffDebounceFromUser = useRef(false);

  const syncEditPolicy = useCallback(
    (rev: Revision | null | undefined, allRevisions: Revision[]) => {
      if (!rev) {
        setCanEdit(false);
        setViewOnlyReasonResolved(viewOnlyReason ?? 'decided');
        return;
      }
      const { viewOnly: vo, reason } = resolveSuggestionViewPolicy(rev, allRevisions, blockId);
      setCanEdit(!vo && rev.status === 'pending');
      setViewOnlyReasonResolved(reason);
    },
    [blockId, viewOnlyReason],
  );

  const loadRevisionFromServer = useCallback(async () => {
    setRevisionLoading(true);
    try {
      const res = await api.listRevisions(documentId);
      let rev = res.data.find((r) => r.id === revisionId);
      if (!rev) {
        try {
          rev = (await api.getRevision(documentId, revisionId)).data;
        } catch {
          // 已拒绝等不在列表中的改稿
        }
      }
      if (rev) {
        const snapshot = rev.snapshot ?? '';
        const prev = rev.previousSnapshot ?? '';
        diffDebounceFromUser.current = false;
        setEditedText(snapshot);
        setDiffBaseText(snapshot);
        setResolvedOldText(prev);
        syncEditPolicy(rev, res.data);
      } else if (newText?.trim()) {
        diffDebounceFromUser.current = false;
        setEditedText(newText);
        setDiffBaseText(newText);
        setResolvedOldText(oldText ?? '');
        syncEditPolicy(null, res.data);
      } else {
        syncEditPolicy(null, res.data);
      }
    } catch (e) {
      clientLog('diff.load_revision.fail', { documentId, revisionId, error: String(e) });
      if (newText?.trim()) {
        diffDebounceFromUser.current = false;
        setEditedText(newText);
        setDiffBaseText(newText);
        setResolvedOldText(oldText ?? '');
      }
      setCanEdit(!viewOnly);
      setViewOnlyReasonResolved(viewOnlyReason);
    } finally {
      setRevisionLoading(false);
    }
  }, [
    documentId,
    revisionId,
    newText,
    oldText,
    viewOnly,
    viewOnlyReason,
    syncEditPolicy,
  ]);

  useEffect(() => {
    void loadRevisionFromServer();
  }, [loadRevisionFromServer]);

  useFocusEffect(
    useCallback(() => {
      void loadRevisionFromServer();
    }, [loadRevisionFromServer]),
  );

  useEffect(() => {
    if (!diffDebounceFromUser.current) return;
    const timer = setTimeout(() => setDiffBaseText(editedText), 280);
    return () => clearTimeout(timer);
  }, [editedText]);

  const handleEditedTextChange = (text: string) => {
    diffDebounceFromUser.current = true;
    setEditedText(text);
  };

  const segments = useMemo(
    () => computeDiff(resolvedOldText, diffBaseText),
    [resolvedOldText, diffBaseText],
  );

  const pageTitle = comment?.trim() || zh.diff.title;
  /** 增删对比、建议正文：同一套正文字号 */
  const contentFontSize = bodyFontSize;
  const contentLineHeight = bodyLineHeight;
  /** 两个模块标题（增删对比 / 建议正文） */
  const panelLabelSize = buttonFontSize;
  const panelLabelLineHeight = Math.round(buttonFontSize * 1.45);
  /** 页顶题目 */
  const pageTitleSize = isTablet ? 42 : 38;
  const pageTitleLineHeight = isTablet ? 58 : 52;
  const goWriting = useCallback(() => {
    leaveDiffPreview(navigation, documentId);
  }, [navigation, documentId]);

  const showRevisionError = (e: unknown) => {
    const { message, hint } = apiErrorText(e);
    appAlert(message, hint, [{ text: zh.common.confirm, onPress: goWriting }]);
  };

  const handleAccept = async () => {
    const finalText = editedText.trim();
    if (!finalText) {
      appAlert(zh.diff.editEmptyTitle, zh.diff.editEmptyHint);
      return;
    }
    clientLog('revision.accept', {
      documentId,
      revisionId,
      manuallyEdited: finalText !== newText,
    });
    setAccepting(true);
    try {
      await api.acceptRevision(documentId, revisionId, finalText);
      navigation.navigate('WritingMain', {
        documentId,
        toast: '已经放进文章里了，您写得真好',
      });
    } catch (e) {
      showRevisionError(e);
    } finally {
      setAccepting(false);
    }
  };

  const handleRejectPress = () => {
    if (!canEdit) {
      goWriting();
      return;
    }
    appAlert(zh.diff.rejectChoiceTitle, zh.diff.rejectChoiceMessage, [
      { text: zh.writing.cancel, style: 'cancel' },
      {
        text: zh.diff.rejectRetry,
        onPress: () => {
          setFocusSection('edit');
          setRetryPanelOpen(true);
        },
      },
      {
        text: zh.diff.rejectGoBack,
        onPress: goWriting,
      },
    ]);
  };

  const handleRetry = async () => {
    const feedback = retryInput.trim();
    if (!blockId) {
      appAlert(zh.writing.retryNoBlock, undefined, [
        { text: zh.common.confirm, onPress: goWriting },
      ]);
      return;
    }
    if (!feedback) {
      appAlert(zh.writing.retryEmptyTitle, zh.writing.retryEmptyHint);
      return;
    }

    clientLog('revision.retry', { documentId, revisionId, action: retryAction });
    setRetrying(true);
    try {
      await api.rejectRevision(documentId, revisionId);
      const res = await api.aiSuggest(documentId, blockId, retryAction, {
        retry: {
          baseInstruction: retryInstruction,
          previousSuggestion: editedText,
          additionalFeedback: feedback,
          priorFeedback: feedbackHistory,
        },
      });
      const nextRev = res.data.revision;
      openDiffPreview(navigation, documentId, nextRev, {
        oldText: res.data.oldText,
        newText: res.data.newText,
        comment: res.data.comment,
        retryAction: nextRev.suggestAction ?? retryAction,
        retryInstruction: nextRev.suggestInstruction ?? retryInstruction,
        suggestAction: nextRev.suggestAction,
        suggestUnderstandingScope: nextRev.suggestUnderstandingScope,
        suggestEvaluation: nextRev.suggestEvaluation,
        suggestRationale: nextRev.suggestRationale,
        feedbackHistory: [...feedbackHistory, feedback],
      });
      setRetryInput('');
      setRetryPanelOpen(false);
    } catch (e) {
      showRevisionError(e);
    } finally {
      setRetrying(false);
    }
  };

  const closeRetryPanel = () => {
    if (retrying) return;
    setRetryPanelOpen(false);
    setRetryInput('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <TabletFrame variant={isTablet ? 'page' : 'content'} style={styles.flex}>
        <View
          style={[
            styles.page,
            { paddingTop: Math.max(insets.top, 12) + 4 },
          ]}
        >
          <Text
            style={[
              styles.pageTitle,
              { fontSize: pageTitleSize, lineHeight: pageTitleLineHeight },
            ]}
          >
            {pageTitle}
          </Text>

          <View style={styles.contentAboveFooter}>
            <View style={styles.sectionsStack}>
            <FocusSectionPanel
              section="diff"
              focus={focusSection}
              onFocus={setFocusSection}
              title={zh.diff.diffPanelLabel}
              labelSize={panelLabelSize}
              labelLineHeight={panelLabelLineHeight}
              highlightActive={canEdit}
            >
              <ScrollView
                style={styles.panelScroll}
                contentContainerStyle={styles.panelScrollContent}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                <DiffView
                  segments={segments}
                  hideComment
                  embedded
                  bodyFontSize={contentFontSize}
                  bodyLineHeight={contentLineHeight}
                />
              </ScrollView>
            </FocusSectionPanel>

            <FocusSectionPanel
              section="edit"
              focus={focusSection}
              onFocus={setFocusSection}
              title={zh.diff.editPanelLabel}
              labelSize={panelLabelSize}
              labelLineHeight={panelLabelLineHeight}
              highlightActive={canEdit}
            >
              <View style={styles.panelBody}>
                {revisionLoading && !editedText.trim() && !newText?.trim() ? (
                  <View style={styles.revisionLoading}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={[styles.revisionLoadingText, { fontSize: contentFontSize }]}>
                      {zh.common.loading}
                    </Text>
                  </View>
                ) : (
                  <AppTextInput
                    containerStyle={styles.editInputWrap}
                    style={[
                      styles.editInput,
                      { fontSize: contentFontSize, lineHeight: contentLineHeight },
                    ]}
                    placeholder={zh.diff.editSuggestionPlaceholder}
                    placeholderTextColor={colors.textMuted}
                    value={editedText}
                    onChangeText={handleEditedTextChange}
                    multiline
                    scrollEnabled
                    textAlignVertical="top"
                    editable={!busy && canEdit}
                  />
                )}
              </View>
            </FocusSectionPanel>
            </View>

            {!canEdit && viewOnlyHintText ? (
              <Text
                style={[
                  styles.viewOnlyHint,
                  { fontSize: contentFontSize, lineHeight: contentLineHeight },
                ]}
              >
                {viewOnlyHintText}
              </Text>
            ) : null}
          </View>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
            {!canEdit ? (
              <PrimaryButton title={zh.writing.backFromDiff} onPress={goWriting} />
            ) : (
              <>
            {retryPanelOpen ? (
              <View style={styles.retryPanel}>
                <AppTextInput
                  style={[
                    styles.retryInput,
                    { fontSize: contentFontSize, lineHeight: contentLineHeight },
                  ]}
                  placeholder={zh.writing.retryPlaceholder}
                  placeholderTextColor={colors.textMuted}
                  value={retryInput}
                  onChangeText={setRetryInput}
                  multiline
                  scrollEnabled
                  textAlignVertical="top"
                  editable={!busy}
                  autoFocus
                />
                {retrying ? (
                  <View style={styles.statusRow}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={styles.statusText}>{zh.writing.retrying}</Text>
                  </View>
                ) : (
                  <View style={styles.retryActions}>
                    <PrimaryButton
                      title={zh.writing.retrySubmit}
                      onPress={() => void handleRetry()}
                      disabled={busy}
                      style={styles.retrySubmitBtn}
                    />
                    <Pressable onPress={closeRetryPanel} hitSlop={8} disabled={busy}>
                      <Text style={styles.retryCancel}>{zh.writing.cancel}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.actionsRow}>
                <PrimaryButton
                  title={zh.writing.reject}
                  onPress={handleRejectPress}
                  variant="secondary"
                  style={styles.actionSide}
                  disabled={busy}
                />
                <PrimaryButton
                  title={zh.writing.apply}
                  onPress={() => void handleAccept()}
                  style={styles.actionSide}
                  disabled={busy}
                />
              </View>
            )}

            {accepting ? (
              <View style={styles.statusRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.statusText}>{zh.common.loading}</Text>
              </View>
            ) : null}
              </>
            )}
          </View>
        </View>
      </TabletFrame>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: {
    flex: 1,
    minHeight: 0,
  },
  pageTitle: {
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
    flexShrink: 0,
    paddingHorizontal: 2,
  },
  contentAboveFooter: {
    flex: 1,
    minHeight: 0,
  },
  sectionsStack: {
    flex: 1,
    minHeight: 0,
    gap: 8,
  },
  sectionPanel: {
    minHeight: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  sectionPanelActive: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  sectionPanelReadOnly: {
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.background,
  },
  panelLabelReadOnly: {
    color: colors.textMuted,
  },
  sectionPanelCollapsed: {
    minHeight: SECTION_COLLAPSED_MIN_HEIGHT,
    flexShrink: 0,
  },
  sectionHeader: {
    flexShrink: 0,
  },
  sectionHeaderCollapsed: {
    flex: 1,
    minHeight: 0,
    paddingVertical: 0,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingRight: 14,
  },
  sectionHeaderRowCollapsed: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 4,
    paddingRight: 0,
    minHeight: SECTION_COLLAPSED_MIN_HEIGHT - 2,
  },
  expandHintButton: {
    alignSelf: 'stretch',
    marginTop: 'auto',
    marginHorizontal: 10,
    marginBottom: 6,
    paddingVertical: 14,
    paddingHorizontal: 20,
    minHeight: 52,
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandHint: {
    color: colors.primaryMutedText,
    fontWeight: '700',
    textAlign: 'center',
  },
  sectionBody: {
    minHeight: 0,
    overflow: 'hidden',
  },
  sectionBodyInner: {
    flex: 1,
    minHeight: 0,
  },
  panelLabelActive: {
    color: colors.primary,
  },
  panelLabelCollapsed: {
    paddingTop: 8,
    paddingBottom: 0,
  },
  viewOnlyHint: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 8,
    flexShrink: 0,
  },
  panelLabel: {
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    flexShrink: 0,
  },
  panelScroll: {
    flex: 1,
    minHeight: 0,
  },
  panelScrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  panelBody: {
    flex: 1,
    minHeight: 120,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  revisionLoading: {
    flex: 1,
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  revisionLoadingText: { color: colors.textMuted },
  editInputWrap: {
    flex: 1,
    minHeight: 120,
    alignSelf: 'stretch',
  },
  editInput: {
    flex: 1,
    minHeight: 120,
    padding: 0,
    color: colors.text,
    backgroundColor: 'transparent',
  },
  footer: {
    flexShrink: 0,
    marginTop: 'auto',
    gap: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  retryPanel: {
    gap: 10,
  },
  retryInput: {
    minHeight: 72,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  retryActions: { gap: 8, alignItems: 'center' },
  retrySubmitBtn: { alignSelf: 'stretch' },
  retryCancel: {
    fontSize: typography.caption,
    color: colors.textMuted,
    paddingVertical: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  statusText: { fontSize: typography.caption, color: colors.textMuted },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionSide: { flex: 1 },
});
