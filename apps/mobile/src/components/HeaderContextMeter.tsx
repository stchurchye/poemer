import { Pressable, StyleSheet, Text } from 'react-native';
import { ContextUsageRing } from './ContextUsageRing';
import { colors } from '../theme/colors';
import { useTextStyles } from '../theme/useTextStyles';
import { zh } from '../locales/zh-CN';

type Props = {
  ratio: number;
  loading?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
};

/** 标题旁上下文占用：圆环贴标题，百分比在圆环右侧 */
export function HeaderContextMeter({ ratio, loading, onPress, onLongPress }: Props) {
  const text = useTextStyles();

  return (
    <Pressable
      style={styles.root}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={zh.context.ringAccessibility}
    >
      <ContextUsageRing
        ratio={ratio}
        loading={loading}
        accessibilityLabel={zh.context.ringAccessibility}
      />
      <Text style={[styles.percent, text.caption]}>
        {loading ? '…' : `${Math.round(ratio * 100)}%`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 6,
  },
  percent: {
    color: colors.textMuted,
    fontWeight: '600',
  },
});
