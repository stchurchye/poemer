import { useCallback, useRef, useState } from 'react';
import type { ColorPalette } from '../theme/colors';
import { typography } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Document } from '@shiren/shared';
import { formatRevisionTime } from '@shiren/shared';
import { api } from '../lib/api';
import { apiErrorText, apiLoadErrorText } from '../lib/apiError';
import {
  useReconnectEffect,
  useSuppressGlobalOfflineBanner,
} from '../context/ApiConnectivityContext';
import { appAlert } from '../lib/appAlert';
import { filterVisibleDocuments } from '../lib/documentVisibility';
import { duplicateDocument } from '../lib/duplicateDocument';
import { promptText } from '../lib/promptText';
import { rememberDocument } from '../lib/writingCache';
import { LoadErrorView } from '../components/LoadErrorView';
import { PrimaryButton } from '../components/PrimaryButton';
import { TabletFrame } from '../components/TabletFrame';
import { lineHeightForFontSize } from '../theme/chromeText';
import { radius } from '../theme/tokens';
import { useLayout } from '../theme/layout';
import { useTextStyles } from '../theme/useTextStyles';
import { zh } from '../locales/zh-CN';
import type { WritingStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<WritingStackParamList, 'DocumentLibrary'>;

export function DocumentLibraryScreen({ navigation, route }: Props) {
  const styles = useThemedStyles(createDocumentLibraryScreenStyles);

  const currentDocumentId = route.params?.currentDocumentId;
  const text = useTextStyles();
  const { titleFontSize, buttonFontSize } = useLayout();
  const pageTitleSize = titleFontSize + 6;
  const pageTitleLineHeight = pageTitleSize * 1.35;
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | undefined>();
  const colors = useColors();
  useSuppressGlobalOfflineBanner(Boolean(error && documents.length === 0));
  const [creating, setCreating] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const hasListedOnceRef = useRef(false);
  const documentsRef = useRef(documents);
  documentsRef.current = documents;

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? hasListedOnceRef.current;
    if (!silent) {
      setLoading(true);
      setError(null);
      setErrorHint(undefined);
    }
    try {
      const res = await api.listDocuments();
      setDocuments(filterVisibleDocuments(res.data));
      hasListedOnceRef.current = true;
    } catch (e) {
      const err = apiLoadErrorText(e);
      if (!silent || documentsRef.current.length === 0) {
        setError(err.message);
        setErrorHint(err.hint);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useReconnectEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load({ silent: hasListedOnceRef.current });
    }, [load]),
  );

  const openDocument = useCallback(
    (documentId: string) => {
      navigation.navigate('WritingMain', { documentId });
    },
    [navigation],
  );

  const createDocument = useCallback(async () => {
    if (creating) return;
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
      rememberDocument(docData);
      openDocument(docData.id);
    } catch (e) {
      const { message, hint } = apiErrorText(e);
      appAlert(zh.writing.newDocFailed, hint ? `${message}\n\n${hint}` : message);
    } finally {
      setCreating(false);
    }
  }, [creating, openDocument]);

  const copyDocument = useCallback(
    async (doc: Document) => {
      if (duplicatingId) return;
      setDuplicatingId(doc.id);
      try {
        const fresh = await api.getDocument(doc.id);
        const copy = await duplicateDocument(fresh.data);
        rememberDocument(copy);
        appAlert('好了', zh.writing.duplicateDocDone);
        await load({ silent: true });
        openDocument(copy.id);
      } catch (e) {
        const { message, hint } = apiErrorText(e);
        appAlert(zh.writing.duplicateDocFailed, hint ? `${message}\n\n${hint}` : message);
      } finally {
        setDuplicatingId(null);
      }
    },
    [duplicatingId, load, openDocument],
  );

  const confirmDelete = useCallback(
    (doc: Document) => {
      const isCurrent = doc.id === currentDocumentId;
      appAlert(
        zh.writing.deleteDocTitle,
        isCurrent ? zh.writing.deleteDocCurrentMessage : zh.writing.deleteDocMessage,
        [
          { text: zh.writing.cancel, style: 'cancel' },
          {
            text: zh.writing.deleteDoc,
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await api.hideDocument(doc.id);
                  await load({ silent: true });
                  if (isCurrent) navigation.goBack();
                } catch (e) {
                  const { message, hint } = apiErrorText(e);
                  appAlert(
                    zh.writing.deleteDocFailed,
                    hint ? `${message}\n\n${hint}` : message,
                  );
                }
              })();
            },
          },
        ],
      );
    },
    [currentDocumentId, load, navigation],
  );

  if (loading && documents.length === 0 && !error) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error && documents.length === 0) {
    return (
      <LoadErrorView message={error} hint={errorHint} onRetry={() => void load()} />
    );
  }

  return (
    <TabletFrame variant="page" style={styles.frame}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.hint, text.body]}>{zh.writing.docLibraryHint}</Text>

        <PrimaryButton
          title={creating ? zh.writing.newDocCreating : zh.writing.newDoc}
          onPress={() => void createDocument()}
          disabled={creating || Boolean(duplicatingId)}
          style={styles.newBtn}
        />

        {documents.length === 0 ? (
          <Text style={[styles.empty, text.body]}>{zh.writing.docLibraryEmpty}</Text>
        ) : (
          <View style={styles.list}>
            {documents.map((doc) => {
              const isCurrent = doc.id === currentDocumentId;
              const time = formatRevisionTime(doc.updatedAt);
              const busy = duplicatingId === doc.id;
              return (
                <View
                  key={doc.id}
                  style={[styles.card, isCurrent && styles.cardCurrent]}
                >
                  <Pressable
                    style={({ pressed }) => [styles.cardMain, pressed && styles.cardPressed]}
                    onPress={() => openDocument(doc.id)}
                    disabled={Boolean(duplicatingId)}
                    accessibilityRole="button"
                    accessibilityLabel={doc.title}
                  >
                    <View style={styles.cardTitleRow}>
                      <Text
                        style={[
                          styles.cardTitle,
                          {
                            fontSize: pageTitleSize,
                            lineHeight: pageTitleLineHeight,
                          },
                        ]}
                        numberOfLines={2}
                      >
                        {doc.title}
                      </Text>
                      <Pressable
                        style={styles.copyBtn}
                        onPress={() => void copyDocument(doc)}
                        disabled={Boolean(duplicatingId)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={zh.writing.duplicateDoc}
                      >
                        {busy ? (
                          <ActivityIndicator color={colors.primary} size="small" />
                        ) : (
                          <Text style={[styles.copyBtnText, { fontSize: buttonFontSize }]}>
                            {zh.writing.duplicateDoc}
                          </Text>
                        )}
                      </Pressable>
                      {isCurrent ? (
                        <View style={styles.currentBadge}>
                          <Text style={styles.currentBadgeText}>{zh.writing.docLibraryCurrent}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.cardMeta} numberOfLines={2}>
                      {zh.writing.docLibraryUpdatedAt} {time.full} ·{' '}
                      {zh.writing.docLibraryChapterCount(doc.chapters.length)}
                    </Text>
                  </Pressable>
                  <View style={styles.cardActions}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.cardActionBtn,
                        pressed && styles.cardActionPressed,
                      ]}
                      onPress={() =>
                        navigation.navigate('RevisionHistory', {
                          documentId: doc.id,
                          title: doc.title,
                        })
                      }
                      disabled={Boolean(duplicatingId)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={zh.writing.history}
                    >
                      <Text style={[styles.cardActionText, { fontSize: buttonFontSize }]}>
                        {zh.writing.history}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.cardActionBtn,
                        pressed && styles.cardActionPressed,
                      ]}
                      onPress={() => confirmDelete(doc)}
                      disabled={Boolean(duplicatingId)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={zh.writing.deleteDoc}
                    >
                      <Text style={[styles.deleteText, { fontSize: buttonFontSize }]}>
                        {zh.writing.deleteDoc}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </TabletFrame>
  );
}

function createDocumentLibraryScreenStyles(colors: ColorPalette) {
  return StyleSheet.create({
  frame: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: { color: colors.textMuted },
  newBtn: { marginBottom: 4 },
  empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: 24 },
  list: { gap: 12 },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  cardCurrent: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  cardMain: { padding: 14, gap: 8 },
  cardPressed: { opacity: 0.88 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 8,
  },
  cardTitle: {
    flexShrink: 1,
    fontWeight: '700',
    color: colors.text,
    maxWidth: '100%',
  },
  copyBtn: {
    flexShrink: 0,
    paddingVertical: 4,
    paddingHorizontal: 2,
    justifyContent: 'center',
    alignSelf: 'center',
  },
  copyBtnText: { color: colors.primary, fontWeight: '600' },
  currentBadge: {
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  currentBadgeText: {
    fontSize: typography.small,
    lineHeight: lineHeightForFontSize(typography.small),
    color: colors.onPrimary,
    fontWeight: '600',
  },
  cardMeta: {
    color: colors.textMuted,
    fontSize: typography.small - 2,
    lineHeight: Math.round((typography.small - 2) * 1.45),
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cardActionBtn: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  cardActionPressed: { opacity: 0.88 },
  cardActionText: { color: colors.primary, fontWeight: '600' },
  deleteText: { color: colors.error, fontWeight: '600' },
});
}
