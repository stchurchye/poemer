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
  getStoredArticleFontPreset,
  getStoredDialogFontPreset,
  setStoredArticleFontPreset,
  setStoredDialogFontPreset,
} from '../lib/fontPreferences';
import { DEFAULT_FONT_SIZE_PRESET, type FontSizePreset } from './fontPresets';

type FontPreferencesValue = {
  articlePreset: FontSizePreset;
  dialogPreset: FontSizePreset;
  ready: boolean;
  setArticlePreset: (preset: FontSizePreset) => Promise<void>;
  setDialogPreset: (preset: FontSizePreset) => Promise<void>;
};

const FontPreferencesContext = createContext<FontPreferencesValue | null>(null);

export function FontPreferencesProvider({ children }: { children: ReactNode }) {
  const [articlePreset, setArticlePresetState] = useState<FontSizePreset>(DEFAULT_FONT_SIZE_PRESET);
  const [dialogPreset, setDialogPresetState] = useState<FontSizePreset>(DEFAULT_FONT_SIZE_PRESET);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [article, dialog] = await Promise.all([
        getStoredArticleFontPreset(),
        getStoredDialogFontPreset(),
      ]);
      if (cancelled) return;
      setArticlePresetState(article);
      setDialogPresetState(dialog);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setArticlePreset = useCallback(async (preset: FontSizePreset) => {
    await setStoredArticleFontPreset(preset);
    setArticlePresetState(preset);
  }, []);

  const setDialogPreset = useCallback(async (preset: FontSizePreset) => {
    await setStoredDialogFontPreset(preset);
    setDialogPresetState(preset);
  }, []);

  const value = useMemo(
    () => ({
      articlePreset,
      dialogPreset,
      ready,
      setArticlePreset,
      setDialogPreset,
    }),
    [articlePreset, dialogPreset, ready, setArticlePreset, setDialogPreset],
  );

  return (
    <FontPreferencesContext.Provider value={value}>{children}</FontPreferencesContext.Provider>
  );
}

export function useFontPreferences(): FontPreferencesValue {
  const ctx = useContext(FontPreferencesContext);
  if (!ctx) {
    throw new Error('useFontPreferences must be used within FontPreferencesProvider');
  }
  return ctx;
}
