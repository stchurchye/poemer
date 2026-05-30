import { StyleSheet } from 'react-native';
import type { ColorPalette } from './colors';
import { radius, shadowFor, touch } from './tokens';
import { useThemedStyles } from './useThemedStyles';

export function createModalStyles(colors: ColorPalette) {
  const shadow = shadowFor(colors);
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.backdrop,
      justifyContent: 'center',
      padding: 20,
    },
    backdropFill: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.backdrop,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    cardCentered: {
      maxHeight: '92%',
      width: '100%',
    },
    alertBackdrop: {
      flex: 1,
      backgroundColor: colors.backdrop,
      justifyContent: 'center',
      paddingVertical: 20,
      paddingHorizontal: 12,
    },
    alertCard: {
      alignSelf: 'center',
      width: '100%',
      maxWidth: 560,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    headerBordered: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 0,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    title: {
      flex: 1,
      fontWeight: '700',
      color: colors.text,
    },
    closeBtn: {
      minWidth: touch.min,
      minHeight: touch.min,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeText: {
      color: colors.textMuted,
      fontWeight: '600',
    },
    sheet: {
      flex: 1,
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.md,
      borderBottomLeftRadius: radius.md,
      borderWidth: 1,
      borderRightWidth: 0,
      borderColor: colors.border,
      overflow: 'hidden',
      shadowColor: shadow.color,
      shadowOffset: { width: -2, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 8,
    },
  });
}

export function useModalStyles() {
  return useThemedStyles(createModalStyles);
}
