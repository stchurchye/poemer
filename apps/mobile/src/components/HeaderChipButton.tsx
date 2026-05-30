import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import type { ColorPalette } from '../theme/colors';
import { typography } from '../theme/colors';
import { chipMinHeightForFontSize, lineHeightForFontSize } from '../theme/chromeText';
import { radius } from '../theme/tokens';
import { useThemedStyles } from '../theme/useThemedStyles';

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

const labelSize = typography.caption;
const labelLineHeight = lineHeightForFontSize(labelSize);
const chipMinHeight = chipMinHeightForFontSize(labelSize);

function createHeaderChipButtonStyles(colors: ColorPalette) {
  return StyleSheet.create({
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
      fontSize: labelSize,
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
}

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
  const styles = useThemedStyles(createHeaderChipButtonStyles);
  const primaryTone = tone === 'primary' && !active;

  return (
    <Pressable
      style={[
        styles.base,
        { minHeight: chipMinHeight },
        active && styles.active,
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text
        style={[
          styles.label,
          { lineHeight: labelLineHeight },
          active && styles.labelActive,
          primaryTone && styles.labelPrimary,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
