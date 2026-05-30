import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Appearance } from '../lib/appearancePreferences';
import type { ColorPalette } from '../theme/colors';
import { useLayout } from '../theme/layout';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { zh } from '../locales/zh-CN';

function createAppearancePickerStyles(colors: ColorPalette) {
  return StyleSheet.create({
    block: { marginBottom: 0 },
    sectionTitle: {
      fontWeight: '600',
      color: colors.text,
      marginBottom: 14,
    },
    sectionTitleTablet: { marginBottom: 16 },
    chipRow: {
      flexDirection: 'row',
      gap: 10,
    },
    chip: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    chipText: { color: colors.textMuted, fontWeight: '600' },
    chipTextActive: { color: colors.text },
  });
}

type Props = {
  onSaved?: () => void;
};

export function AppearancePicker({ onSaved }: Props) {
  const styles = useThemedStyles(createAppearancePickerStyles);
  const { appearance, setAppearance } = useTheme();
  const { isTablet, buttonFontSize, captionFontSize } = useLayout();
  const chipLineHeight = Math.round(captionFontSize * 1.12);

  const select = async (next: Appearance) => {
    if (next === appearance) return;
    await setAppearance(next);
    onSaved?.();
  };

  return (
    <View style={styles.block}>
      <Text
        style={[
          styles.sectionTitle,
          { fontSize: buttonFontSize },
          isTablet && styles.sectionTitleTablet,
        ]}
      >
        {zh.me.appearanceTitle}
      </Text>
      <View style={styles.chipRow}>
        <Pressable
          style={[styles.chip, appearance === 'light' && styles.chipActive]}
          onPress={() => void select('light')}
          accessibilityRole="button"
          accessibilityState={{ selected: appearance === 'light' }}
        >
          <Text
            style={[
              styles.chipText,
              { fontSize: captionFontSize, lineHeight: chipLineHeight },
              appearance === 'light' && styles.chipTextActive,
            ]}
          >
            {zh.me.appearanceLight}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.chip, appearance === 'dark' && styles.chipActive]}
          onPress={() => void select('dark')}
          accessibilityRole="button"
          accessibilityState={{ selected: appearance === 'dark' }}
        >
          <Text
            style={[
              styles.chipText,
              { fontSize: captionFontSize, lineHeight: chipLineHeight },
              appearance === 'dark' && styles.chipTextActive,
            ]}
          >
            {zh.me.appearanceDark}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
