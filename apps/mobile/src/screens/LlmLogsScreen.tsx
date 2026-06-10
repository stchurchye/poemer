import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ColorPalette } from '../theme/colors';
import { typography } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useLayout } from '../theme/layout';
import { TabletFrame } from '../components/TabletFrame';
import { appAlert } from '../lib/appAlert';
import { zh } from '../locales/zh-CN';
import {
  clearLlmLogs,
  formatLlmLogsText,
  getLlmLogEntries,
  type LlmLogEntry,
} from '../lib/llmLog';

function statusTone(entry: LlmLogEntry): 'ok' | 'error' {
  // 402/欠费、401/403 密钥权限、reasoning-only 都用同一警示色，靠文字区分
  return entry.ok ? 'ok' : 'error';
}

export function LlmLogsScreen() {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { isTablet, width } = useLayout();
  const [entries, setEntries] = useState<LlmLogEntry[]>([]);

  const refresh = useCallback(() => {
    setEntries(getLlmLogEntries());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onCopy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(formatLlmLogsText());
      appAlert(zh.me.llmLogsCopied);
    } catch {
      appAlert(zh.me.llmLogsCopyFailed);
    }
  }, []);

  const onClear = useCallback(() => {
    clearLlmLogs();
    refresh();
    appAlert(zh.me.llmLogsCleared);
  }, [refresh]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: isTablet ? Math.max(insets.top, 12) : 12,
          maxWidth: width,
          width: '100%',
          alignSelf: 'center',
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <TabletFrame variant="settings" scrollChild>
        <Text style={styles.hint}>{zh.me.llmLogsHint}</Text>

        <View style={styles.actionRow}>
          <Pressable
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => void onCopy()}
            accessibilityRole="button"
          >
            <Text style={styles.btnPrimaryText}>{zh.me.llmLogsCopy}</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnSecondary]}
            onPress={onClear}
            accessibilityRole="button"
          >
            <Text style={styles.btnSecondaryText}>{zh.me.llmLogsClear}</Text>
          </Pressable>
        </View>

        <Text style={styles.count}>{zh.me.llmLogsCount(entries.length)}</Text>

        {entries.length === 0 ? (
          <Text style={styles.empty}>{zh.me.llmLogsEmpty}</Text>
        ) : (
          entries.map((e, i) => {
            const tone = statusTone(e);
            return (
              <View key={`${e.ts}-${i}`} style={styles.entry}>
                <View style={styles.entryHead}>
                  <Text
                    style={[
                      styles.badge,
                      tone === 'ok' ? styles.badgeOk : styles.badgeError,
                    ]}
                  >
                    {e.ok ? '✓' : '✗'}
                  </Text>
                  <Text style={styles.entryLabel} numberOfLines={1}>
                    {e.label}
                  </Text>
                  <Text style={styles.entryTime}>{e.ts.slice(11, 19)}</Text>
                </View>
                <Text style={styles.entryMeta}>
                  {e.provider}
                  {e.model ? ` · ${e.model}` : ''} · status={e.status ?? '-'}
                  {e.durationMs != null ? ` · ${e.durationMs}ms` : ''}
                  {e.contentLen != null ? ` · content=${e.contentLen}` : ''}
                </Text>
                {e.reasoningOnly ? (
                  <Text style={styles.entryReasoning}>
                    只有思考内容、正文为空（疑似 thinking，非欠费）
                  </Text>
                ) : null}
                {e.errorMessage ? (
                  <Text style={styles.entryError}>
                    {e.errorCode ? `[${e.errorCode}] ` : ''}
                    {e.errorMessage}
                  </Text>
                ) : null}
              </View>
            );
          })
        )}
      </TabletFrame>
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 48 },
    hint: {
      color: colors.textMuted,
      fontSize: typography.caption,
      lineHeight: typography.bodyLineHeight,
      marginBottom: 16,
    },
    actionRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    btn: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 10,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnPrimary: { backgroundColor: colors.primary },
    btnPrimaryText: { color: colors.onPrimary, fontWeight: '600' },
    btnSecondary: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    btnSecondaryText: { color: colors.text, fontWeight: '600' },
    count: { color: colors.textMuted, fontSize: typography.caption, marginBottom: 12 },
    empty: {
      color: colors.textMuted,
      fontSize: typography.body,
      lineHeight: typography.bodyLineHeight,
      paddingVertical: 24,
      textAlign: 'center',
    },
    entry: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 12,
    },
    entryHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    badge: {
      fontSize: typography.caption,
      fontWeight: '700',
      width: 20,
      textAlign: 'center',
    },
    badgeOk: { color: '#22a06b' },
    badgeError: { color: '#d23f3f' },
    entryLabel: { flex: 1, color: colors.text, fontWeight: '600' },
    entryTime: { color: colors.textMuted, fontSize: typography.caption },
    entryMeta: {
      color: colors.textMuted,
      fontSize: typography.caption,
      marginTop: 6,
    },
    entryReasoning: {
      color: '#b8860b',
      fontSize: typography.caption,
      lineHeight: typography.bodyLineHeight,
      marginTop: 6,
    },
    entryError: {
      color: '#d23f3f',
      fontSize: typography.caption,
      lineHeight: typography.bodyLineHeight,
      marginTop: 6,
    },
  });
}
