import { StyleSheet } from 'react-native';
import type { ColorPalette } from './colors';
import { radius } from './tokens';
import { useThemedStyles } from './useThemedStyles';

export function createChatMessageStyles(colors: ColorPalette) {
  return StyleSheet.create({
    row: {
      width: '100%',
      flexShrink: 0,
      marginBottom: 20,
    },
    assistant: {
      alignSelf: 'stretch',
      maxWidth: '100%',
      paddingHorizontal: 4,
      paddingVertical: 4,
      backgroundColor: 'transparent',
    },
    assistantTablet: {
      paddingHorizontal: 6,
    },
    user: {
      alignSelf: 'flex-end',
      maxWidth: '88%',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: radius.md,
      backgroundColor: colors.primarySoft,
    },
    userTablet: {
      maxWidth: '72%',
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    notice: {
      alignSelf: 'stretch',
      maxWidth: '100%',
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: radius.sm,
      backgroundColor: colors.waiting,
    },
    error: {
      alignSelf: 'stretch',
      maxWidth: '100%',
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: radius.sm,
      backgroundColor: colors.waiting,
    },
    text: {
      color: colors.text,
    },
    pendingRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      flexShrink: 0,
    },
  });
}

export function useChatMessageStyles() {
  return useThemedStyles(createChatMessageStyles);
}
