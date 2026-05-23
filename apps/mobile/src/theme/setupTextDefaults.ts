import { Text, TextInput } from 'react-native';

type WithDefaultProps<T> = T & {
  defaultProps?: { allowFontScaling?: boolean; maxFontSizeMultiplier?: number };
};

/**
 * 关闭 RN 默认的 allowFontScaling，避免「系统无障碍字号 × App 预设字号」叠乘。
 * 字号由 fontPresets（以系统默认正文为锚）统一控制。
 */
export function setupTextDefaults(): void {
  const TextWithDefaults = Text as WithDefaultProps<typeof Text>;
  TextWithDefaults.defaultProps ??= {};
  TextWithDefaults.defaultProps.allowFontScaling = false;
  TextWithDefaults.defaultProps.maxFontSizeMultiplier = 1;

  const TextInputWithDefaults = TextInput as WithDefaultProps<typeof TextInput>;
  TextInputWithDefaults.defaultProps ??= {};
  TextInputWithDefaults.defaultProps.allowFontScaling = false;
  TextInputWithDefaults.defaultProps.maxFontSizeMultiplier = 1;
}
