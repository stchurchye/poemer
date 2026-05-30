import {
  DarkTheme,
  DefaultTheme,
  type Theme as NavTheme,
} from '@react-navigation/native';
import type { Appearance } from '../lib/appearancePreferences';
import type { ColorPalette } from './colors';

export function buildNavTheme(colors: ColorPalette, appearance: Appearance): NavTheme {
  const base = appearance === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.primary,
    },
  };
}
