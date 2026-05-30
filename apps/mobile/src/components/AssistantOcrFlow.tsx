import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import type { ColorPalette } from '../theme/colors';
import { typography } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { zh } from '../locales/zh-CN';

/** 识图结果插入方式（当前固定为章节末尾） */
export type OcrInsertMode = 'end';

type Props = {
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
  /** 与「按住说话」并排时的紧凑样式 */
  inline?: boolean;
};

/** 识图录入入口按钮（实际选图逻辑在写作页根级执行，避免嵌套 Modal） */
export function AssistantOcrFlow({ disabled, busy, onPress, inline }: Props) {
  const colors = useColors();
  const styles = useThemedStyles(createAssistantOcrFlowStyles);

  return (
    <Pressable
      style={[
        styles.ocrBtn,
        inline && styles.ocrBtnInline,
        (disabled || busy) && styles.ocrBtnDisabled,
      ]}
      onPress={onPress}
      disabled={disabled || busy}
      hitSlop={6}
    >
      {busy ? (
        <ActivityIndicator color={colors.primary} size="small" />
      ) : (
        <Text style={[styles.ocrBtnText, inline && styles.ocrBtnTextInline]}>
          {inline ? zh.writing.ocrPhotoShort : zh.writing.ocrPhoto}
        </Text>
      )}
    </Pressable>
  );
}

function createAssistantOcrFlowStyles(colors: ColorPalette) {
  return StyleSheet.create({
  ocrBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ocrBtnDisabled: { opacity: 0.5 },
  ocrBtnInline: {
    minWidth: 76,
    paddingHorizontal: 12,
    minHeight: 48,
    backgroundColor: colors.background,
  },
  ocrBtnText: { fontSize: typography.caption, color: colors.primary, fontWeight: '600' },
  ocrBtnTextInline: { fontSize: typography.small },
});
}
