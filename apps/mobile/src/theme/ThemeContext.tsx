import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getMemoryAppearance,
  getStoredAppearance,
  setStoredAppearance,
  type Appearance,
} from '../lib/appearancePreferences';
import { paletteForAppearance, type ColorPalette } from './colors';

type ThemeContextValue = {
  appearance: Appearance;
  colors: ColorPalette;
  ready: boolean;
  setAppearance: (next: Appearance) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const memoryOnMount = getMemoryAppearance();
  const [appearance, setAppearanceState] = useState<Appearance>(memoryOnMount ?? 'light');
  const [ready, setReady] = useState(memoryOnMount !== null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getStoredAppearance();
      if (cancelled) return;
      setAppearanceState(stored);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setAppearance = useCallback(async (next: Appearance) => {
    await setStoredAppearance(next);
    setAppearanceState(next);
    setReady(true);
  }, []);

  const colors = useMemo(() => paletteForAppearance(appearance), [appearance]);

  const value = useMemo(
    () => ({
      appearance,
      colors,
      ready,
      setAppearance,
    }),
    [appearance, colors, ready, setAppearance],
  );

  if (!ready) {
    return null;
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

export function useColors(): ColorPalette {
  return useTheme().colors;
}
