import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Revision } from '@shiren/shared';
import { formatRevisionTime, groupRevisionsByDay } from '@shiren/shared';
import { appAlert } from '../lib/appAlert';
import { api } from '../lib/api';
import { openDiffPreview } from '../lib/openDiffPreview';
import { resolveSuggestionViewPolicy } from '../lib/suggestionViewOnly';
import { TabletFrame } from '../components/TabletFrame';
import { colors, typography } from '../theme/colors';
import { useLayout, useTypography } from '../theme/layout';
import { zh } from '../locales/zh-CN';
import type { WritingStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<WritingStackParamList, 'RevisionHistory'>;

export function RevisionHistoryScreen({ route, navigation }: Props) {
  const { documentId, title } = route.params;
  const { titleFontSize, buttonFontSize } = useLayout();
  const { bodyFontSize, bodyLineHeight } = useTypography('article');
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [allRevisions, setAllRevisions] = useState<Revision[]>([]);
  const pageTitleSize = titleFontSize + 6;

  const load = useCallback(async () => {
    const res = await api.listRevisions(documentId);
    setAllRevisions(res.data);
    setRevisions(res.data.filter((r) => r.status === 'accepted' || r.status === 'pending'));
  }, [documentId]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = groupRevisionsByDay(revisions);

  const rollback = (rev: Revision) => {
    const time = formatRevisionTime(rev.createdAt);
    appAlert(
      zh.diff.rollback,
      `${zh.diff.rollbackConfirm}\n\n${time.full}`,
      [
        { text: zh.common.back, style: 'cancel' },
        {
          text: zh.common.confirm,
          onPress: async () => {
            await api.rollback(documentId, rev.id);
            navigation.navigate('WritingMain', { documentId });
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TabletFrame variant="content" scrollChild>
      <Text style={[styles.title, { fontSize: pageTitleSize, lineHeight: pageTitleSize * 1.35 }]}>
        {zh.writing.history} · {title}
      </Text>
      {groups.map((group) => (
        <View key={group.dateKey} style={styles.group}>
          <Text style={[styles.groupTitle, { fontSize: buttonFontSize }]}>▼ {group.groupTitle}</Text>
          {group.items.map((rev) => {
            const t = formatRevisionTime(rev.createdAt);
            const isPending = rev.status === 'pending';
            return (
              <Pressable
                key={rev.id}
                style={[styles.item, isPending && styles.itemPending]}
                onPress={() => {
                  if (isPending) {
                    const blockId = rev.blockId ?? '';
                    const { viewOnly, reason } = resolveSuggestionViewPolicy(
                      rev,
                      allRevisions,
                      blockId,
                    );
                    openDiffPreview(navigation, documentId, rev, {
                      viewOnly,
                      viewOnlyReason: reason,
                    });
                    return;
                  }
                  rollback(rev);
                }}
              >
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTime}>○ {t.itemTime}</Text>
                  {isPending ? (
                    <Text style={styles.pendingBadge}>{zh.diff.pendingBadge}</Text>
                  ) : null}
                </View>
                <Text style={[styles.itemSummary, { fontSize: bodyFontSize, lineHeight: bodyLineHeight }]}>
                  {rev.summary}
                </Text>
                {isPending ? (
                  <Text style={styles.itemHint}>{zh.diff.viewFromHistory}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
      {revisions.length === 0 ? (
        <Text style={styles.empty}>还没有保存的版本，写完一段就会帮您记下来。</Text>
      ) : null}
      </TabletFrame>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: typography.title, fontWeight: '700', color: colors.text, marginBottom: 16 },
  group: { marginBottom: 20 },
  groupTitle: {
    fontSize: typography.button,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemPending: {
    backgroundColor: colors.insertBg,
    borderRadius: 8,
    marginBottom: 4,
    borderBottomWidth: 0,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTime: { fontSize: typography.caption, color: colors.textMuted },
  pendingBadge: {
    fontSize: typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  itemHint: { fontSize: typography.caption, color: colors.primary, marginTop: 6 },
  itemSummary: {
    fontSize: typography.body,
    color: colors.text,
    marginTop: 4,
    lineHeight: typography.bodyLineHeight,
  },
  empty: {
    fontSize: typography.body,
    color: colors.textMuted,
    lineHeight: typography.bodyLineHeight,
  },
});
