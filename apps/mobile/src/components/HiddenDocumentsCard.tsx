import { useCallback, useState } from 'react';
import type { ColorPalette } from '../theme/colors';
import { typography } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { Document } from '@shiren/shared';
import { formatRevisionTime } from '@shiren/shared';
import { api } from '../lib/api';
import { apiErrorText } from '../lib/apiError';
import { appAlert } from '../lib/appAlert';
import { filterHiddenDocuments } from '../lib/documentVisibility';
import { useLayout } from '../theme/layout';
import { zh } from '../locales/zh-CN';

export function HiddenDocumentsCard() {
  const styles = useThemedStyles(createHiddenDocumentsCardStyles);
  const colors = useColors();
  const { isTablet, bodyFontSize, buttonFontSize } = useLayout();
  const [hiddenDocs, setHiddenDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listDocuments();
      setHiddenDocs(filterHiddenDocuments(res.data));
    } catch {
      setHiddenDocs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const restore = useCallback(
    async (doc: Document) => {
      if (restoringId) return;
      setRestoringId(doc.id);
      try {
        await api.restoreDocument(doc.id);
        appAlert('好了', zh.me.restoreDocDone);
        await load();
      } catch (e) {
        const { message, hint } = apiErrorText(e);
        appAlert(zh.me.restoreDocFailed, hint ? `${message}\n\n${hint}` : message);
      } finally {
        setRestoringId(null);
      }
    },
    [load, restoringId],
  );

  if (loading && hiddenDocs.length === 0) {
    return null;
  }

  if (hiddenDocs.length === 0) {
    return null;
  }

  return (
    <View style={[styles.card, isTablet && styles.cardTablet]}>
      <Text style={[styles.title, { fontSize: buttonFontSize }]}>{zh.me.hiddenDocsTitle}</Text>
      <Text style={[styles.hint, { fontSize: bodyFontSize * 0.9 }]}>{zh.me.hiddenDocsHint}</Text>
      <View style={styles.list}>
        {hiddenDocs.map((doc) => {
          const time = formatRevisionTime(doc.updatedAt);
          const busy = restoringId === doc.id;
          return (
            <View key={doc.id} style={styles.row}>
              <View style={styles.rowBody}>
                <Text style={[styles.docTitle, { fontSize: bodyFontSize }]} numberOfLines={2}>
                  {doc.title}
                </Text>
                <Text style={styles.docMeta} numberOfLines={1}>
                  {zh.writing.docLibraryUpdatedAt} {time.full}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.restoreBtn, pressed && styles.restorePressed]}
                onPress={() => void restore(doc)}
                disabled={Boolean(restoringId)}
                accessibilityRole="button"
                accessibilityLabel={zh.me.restoreDoc}
              >
                {busy ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <Text style={[styles.restoreText, { fontSize: buttonFontSize * 0.9 }]}>
                    {zh.me.restoreDoc}
                  </Text>
                )}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function createHiddenDocumentsCardStyles(colors: ColorPalette) {
  return StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  cardTablet: { padding: 24, marginBottom: 28 },
  title: { fontWeight: '600', color: colors.text, marginBottom: 8 },
  hint: { color: colors.textMuted, marginBottom: 14, lineHeight: 20 },
  list: { gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowBody: { flex: 1, minWidth: 0 },
  docTitle: { fontWeight: '600', color: colors.text },
  docMeta: {
    color: colors.textMuted,
    fontSize: typography.small - 2,
    marginTop: 4,
  },
  restoreBtn: {
    flexShrink: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restorePressed: { opacity: 0.88 },
  restoreText: { color: colors.primary, fontWeight: '600' },
});
}
