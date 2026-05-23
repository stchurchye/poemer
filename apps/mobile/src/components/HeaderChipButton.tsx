import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors, typography } from '../theme/colors';
import { radius } from '../theme/tokens';

type Tone = 'muted' | 'primary';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  tone?: Tone;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** 页头/侧栏上的扁平操作钮（对齐写作页「开始朗读」工具条芯片） */
export function HeaderChipButton({
  label,
  onPress,
  disabled,
  active,
  tone = 'muted',
  accessibilityLabel,
  style,
}: Props) {
  const primaryTone = tone === 'primary' && !active;
  return (
    <Pressable
      style={[styles.base, active && styles.active, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text
        style={[
          styles.label,
          active && styles.labelActive,
          primaryTone && styles.labelPrimary,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  active: {
    borderColor: colors.primary,
  },
  disabled: { opacity: 0.45 },
  label: {
    fontSize: typography.caption,
    color: colors.textMuted,
    fontWeight: '500',
  },
  labelActive: {
    color: colors.text,
    fontWeight: '600',
  },
  labelPrimary: {
    color: colors.primary,
    fontWeight: '700',
  },
});
