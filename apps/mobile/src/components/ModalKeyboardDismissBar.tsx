import { Keyboard, Pressable, StyleSheet, Text } from 'react-native';
import { useKeyboardVisible } from '../hooks/useKeyboardVisible';
import type { ColorPalette } from '../theme/colors';
import { typography } from '../theme/colors';
import { zh } from '../locales/zh-CN';
import { useThemedStyles } from '../theme/useThemedStyles';

function createModalKeyboardDismissBarStyles(colors: ColorPalette) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingHorizontal: 4,
      paddingBottom: 8,
      marginTop: -4,
    },
    action: {
      fontSize: typography.caption,
      fontWeight: '600',
      color: colors.primary,
    },
  });
}

/** 弹窗内键盘弹起时，右上角「点击关闭键盘」（与写作/看一看顶栏收起条一致） */
export function ModalKeyboardDismissBar() {
  const styles = useThemedStyles(createModalKeyboardDismissBarStyles);
  const keyboardVisible = useKeyboardVisible();
  if (!keyboardVisible) return null;

  return (
    <Pressable
      style={styles.bar}
      onPress={() => Keyboard.dismiss()}
      accessibilityRole="button"
      accessibilityLabel={zh.writing.expandChrome}
    >
      <Text style={styles.action}>{zh.writing.expandChrome}</Text>
    </Pressable>
  );
}
