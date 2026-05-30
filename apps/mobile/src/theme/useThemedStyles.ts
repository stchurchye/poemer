import { useMemo } from 'react';
import type { ColorPalette } from './colors';
import { useColors } from './ThemeContext';

export function useThemedStyles<T>(factory: (colors: ColorPalette) => T): T {
  const colors = useColors();
  return useMemo(() => factory(colors), [colors, factory]);
}
