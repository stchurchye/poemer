import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ColorPalette } from '../theme/colors';
import { typography } from '../theme/colors';
import { zh } from '../locales/zh-CN';
import { useColors } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';

interface Props {
  title?: string;
  subtitle?: string;
  onCancel?: () => void;
}

function createWaitingBarStyles(colors: ColorPalette) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.waiting,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    textCol: { flex: 1 },
    title: { fontSize: typography.button, color: colors.text, fontWeight: '600' },
    sub: { fontSize: typography.caption, color: colors.textMuted, marginTop: 4 },
    cancel: { fontSize: typography.caption, color: colors.primary },
  });
}

export function WaitingBar({
  title = zh.writing.thinkingZh,
  subtitle,
  onCancel,
}: Props) {
  const colors = useColors();
  const styles = useThemedStyles(createWaitingBarStyles);

  return (
    <View style={styles.bar}>
      <ActivityIndicator color={colors.primary} />
      <View style={styles.textCol}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
      {onCancel ? (
        <Pressable onPress={onCancel} hitSlop={12}>
          <Text style={styles.cancel}>{zh.writing.cancel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
