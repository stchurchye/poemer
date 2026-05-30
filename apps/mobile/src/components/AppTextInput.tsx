import { forwardRef } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextInput as TextInputType,
  type ViewStyle,
} from 'react-native';
import { useColors, useTheme } from '../theme/ThemeContext';

export type AppTextInputVariant = 'default' | 'compose';

/**
 * 统一 TextInput：避免 flex:1 单独撑满时 iOS 无法聚焦/软键盘不弹（尤其新架构）。
 */
type Props = TextInputProps & {
  /** 外层容器样式（用于 flex 面板内约束高度） */
  containerStyle?: StyleProp<ViewStyle>;
  /** compose：底部聊天栏矮输入框；default：写作正文等大框 */
  variant?: AppTextInputVariant;
};

export const AppTextInput = forwardRef<TextInputType, Props>(function AppTextInput(
  { style, containerStyle, multiline, variant = 'default', placeholderTextColor, keyboardAppearance, ...rest },
  ref,
) {
  const colors = useColors();
  const { appearance } = useTheme();
  const isCompose = variant === 'compose';
  const wrapStyle = multiline
    ? isCompose
      ? styles.composeMultilineWrap
      : styles.multilineWrap
    : styles.singleWrap;
  const inputStyle = multiline
    ? isCompose
      ? styles.composeMultilineInput
      : styles.multilineInput
    : styles.singleInput;

  return (
    <View collapsable={false} style={[wrapStyle, containerStyle]}>
      <TextInput
        ref={ref}
        multiline={multiline}
        showSoftInputOnFocus={Platform.OS === 'ios' ? true : undefined}
        style={[inputStyle, style]}
        placeholderTextColor={placeholderTextColor ?? colors.textMuted}
        keyboardAppearance={keyboardAppearance ?? (appearance === 'dark' ? 'dark' : 'light')}
        {...rest}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  singleWrap: {
    width: '100%',
    justifyContent: 'center',
  },
  singleInput: {
    minHeight: 48,
    width: '100%',
    ...(Platform.OS === 'android'
      ? { textAlignVertical: 'center' as const, includeFontPadding: false }
      : null),
  },
  multilineWrap: {
    width: '100%',
    minHeight: 120,
    flexGrow: 1,
  },
  multilineInput: {
    width: '100%',
    minHeight: 120,
    flexGrow: 1,
  },
  composeMultilineWrap: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    justifyContent: 'center',
  },
  composeMultilineInput: {
    width: '100%',
    minHeight: 36,
    maxHeight: 108,
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 12 : 10,
    paddingBottom: Platform.OS === 'ios' ? 12 : 10,
    ...(Platform.OS === 'android'
      ? { textAlignVertical: 'center' as const, includeFontPadding: false }
      : null),
  },
});
