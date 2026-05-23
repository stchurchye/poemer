import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import {
  FONT_SIZE_PRESETS,
  resolveFontMetrics,
  type FontSizePreset,
} from '../theme/fontPresets';
import { useLayout } from '../theme/layout';
import { zh } from '../locales/zh-CN';

const PRESET_LABEL: Record<FontSizePreset, string> = {
  xsmall: zh.me.fontPresetXsmall,
  small: zh.me.fontPresetSmall,
  medium: zh.me.fontPresetMedium,
  large: zh.me.fontPresetLarge,
  xlarge: zh.me.fontPresetXlarge,
};

type Props = {
  title: string;
  sampleText: string;
  value: FontSizePreset;
  onChange: (preset: FontSizePreset) => void;
};

/** 选项按钮内单行标签行高（不用正文段落行高，避免按钮过高） */
function chipLabelLineHeight(fontSize: number) {
  return Math.round(fontSize * 1.12);
}

export function FontSizePresetPicker({ title, sampleText, value, onChange }: Props) {
  const { isTablet, buttonFontSize, captionFontSize } = useLayout();
  const sampleMetrics = resolveFontMetrics(value, isTablet);
  const xlargeBodySize = resolveFontMetrics('xlarge', isTablet).bodyFontSize;
  const chipHeight = chipLabelLineHeight(xlargeBodySize) + 12;
  const chipLabelSize = captionFontSize;

  return (
    <View style={styles.block}>
      <Text
        style={[
          styles.sectionTitle,
          { fontSize: buttonFontSize },
          isTablet && styles.sectionTitleTablet,
        ]}
      >
        {title}
      </Text>
      <View style={styles.chipRow}>
        {FONT_SIZE_PRESETS.map((preset) => {
          const active = value === preset;
          return (
            <Pressable
              key={preset}
              style={[styles.chip, { height: chipHeight }, active && styles.chipActive]}
              onPress={() => onChange(preset)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    fontSize: chipLabelSize,
                    lineHeight: chipLabelLineHeight(chipLabelSize),
                  },
                  active && styles.chipTextActive,
                ]}
              >
                {PRESET_LABEL[preset]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text
        style={[
          styles.sample,
          {
            fontSize: sampleMetrics.bodyFontSize,
            lineHeight: sampleMetrics.bodyLineHeight,
          },
        ]}
      >
        {sampleText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: 24 },
  sectionTitle: {
    fontWeight: '600',
    color: colors.text,
    marginBottom: 14,
  },
  sectionTitleTablet: { marginBottom: 16 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  chip: {
    flex: 1,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  chipText: { color: colors.textMuted, fontWeight: '600' },
  chipTextActive: { color: colors.text },
  sample: { color: colors.text },
});
