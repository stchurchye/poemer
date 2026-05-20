import * as SecureStore from 'expo-secure-store';
import {
  DEFAULT_FONT_SIZE_PRESET,
  isFontSizePreset,
  type FontSizePreset,
} from '../theme/fontPresets';

const ARTICLE_FONT_KEY = 'shiren_font_article';
const DIALOG_FONT_KEY = 'shiren_font_dialog';

async function readPreset(key: string): Promise<FontSizePreset> {
  try {
    const v = await SecureStore.getItemAsync(key);
    return isFontSizePreset(v) ? v : DEFAULT_FONT_SIZE_PRESET;
  } catch {
    return DEFAULT_FONT_SIZE_PRESET;
  }
}

async function writePreset(key: string, preset: FontSizePreset): Promise<void> {
  await SecureStore.setItemAsync(key, preset);
}

export function getStoredArticleFontPreset(): Promise<FontSizePreset> {
  return readPreset(ARTICLE_FONT_KEY);
}

export function setStoredArticleFontPreset(preset: FontSizePreset): Promise<void> {
  return writePreset(ARTICLE_FONT_KEY, preset);
}

export function getStoredDialogFontPreset(): Promise<FontSizePreset> {
  return readPreset(DIALOG_FONT_KEY);
}

export function setStoredDialogFontPreset(preset: FontSizePreset): Promise<void> {
  return writePreset(DIALOG_FONT_KEY, preset);
}

export async function loadStoredFontPresets(): Promise<{
  article: FontSizePreset;
  dialog: FontSizePreset;
}> {
  const [article, dialog] = await Promise.all([
    getStoredArticleFontPreset(),
    getStoredDialogFontPreset(),
  ]);
  return { article, dialog };
}
