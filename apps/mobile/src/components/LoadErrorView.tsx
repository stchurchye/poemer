import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ColorPalette } from '../theme/colors';
import { typography } from '../theme/colors';
import { zh } from '../locales/zh-CN';
import { useThemedStyles } from '../theme/useThemedStyles';

interface Props {
  message: string;
  hint?: string;
  onRetry: () => void;
}

function createLoadErrorViewStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
    title: { fontSize: typography.title, fontWeight: '700', color: colors.text },
    message: { fontSize: typography.caption, color: colors.textMuted, textAlign: 'center' },
    hint: {
      fontSize: typography.caption,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: typography.bodyLineHeight,
    },
    btn: {
      marginTop: 8,
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 12,
    },
    btnText: { color: colors.onPrimary, fontWeight: '600', fontSize: typography.button },
  });
}

export function LoadErrorView({ message, hint, onRetry }: Props) {
  const styles = useThemedStyles(createLoadErrorViewStyles);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{zh.common.loadFailed}</Text>
      <Text style={styles.message}>{message}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <Pressable style={styles.btn} onPress={onRetry}>
        <Text style={styles.btnText}>{zh.common.retry}</Text>
      </Pressable>
    </View>
  );
}
