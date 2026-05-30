import { DEFAULT_FONT_SIZE_PRESET, resolveFontMetrics } from './fontPresets';

export const lightColors = {
  background: '#f5f7fa',
  surface: '#ffffff',
  text: '#1a1a1a',
  textMuted: '#8a8a9a',
  primary: '#4e6ef2',
  primarySoft: '#eef1fd',
  assistantBg: '#f0f2f8',
  intentConfirmBg: '#eef1f6',
  intentConfirmTextBg: '#e3e6ee',
  onPrimary: '#ffffff',
  backdrop: 'rgba(0, 0, 10, 0.45)',
  primaryBorder: '#c8d2f8',
  primaryMutedText: '#3d56d4',
  insertBg: '#dff5e4',
  insertBorder: '#66bb6a',
  insertText: '#1b5e20',
  deleteBg: '#fdecea',
  deleteBorder: '#ef9a9a',
  deleteText: '#b71c1c',
  border: '#e5e6eb',
  tabInactive: '#9899a6',
  waiting: '#f5f7fa',
  error: '#c62828',
  success: '#558b2f',
  inputSurface: '#ffffff',
  tabBar: '#ffffff',
  tabActive: '#4e6ef2',
  imageOverlay: 'rgba(0,0,0,0.55)',
  imageOverlayText: '#ffffff',
  /** 分享长图分隔线（导出路径 palette=lightColors） */
  shareRuleDecor: '#e0d4c8',
  markdownCodeBg: '#2d2a28',
  markdownCodeText: '#f5f0ea',
} as const;

export const darkColors = {
  background: '#121212',
  surface: '#1c1c1e',
  text: '#ffffff',
  textMuted: '#8e8e93',
  primary: '#4e6ef2',
  primarySoft: '#333333',
  assistantBg: '#121212',
  intentConfirmBg: '#2c2c2e',
  intentConfirmTextBg: '#3a3a3c',
  onPrimary: '#ffffff',
  backdrop: 'rgba(0, 0, 0, 0.65)',
  primaryBorder: '#3d4a6e',
  primaryMutedText: '#8fa3ff',
  insertBg: '#1b3324',
  insertBorder: '#4a7c59',
  insertText: '#a5d6a7',
  deleteBg: '#3a2224',
  deleteBorder: '#8f4f4f',
  deleteText: '#ef9a9a',
  border: '#2c2c2e',
  tabInactive: '#8e8e93',
  waiting: '#1c1c1e',
  error: '#ef5350',
  success: '#81c784',
  inputSurface: '#252525',
  tabBar: '#000000',
  tabActive: '#ffffff',
  imageOverlay: 'rgba(0,0,0,0.65)',
  imageOverlayText: '#ffffff',
  shareRuleDecor: '#e0d4c8',
  markdownCodeBg: '#2d2a28',
  markdownCodeText: '#f5f0ea',
} as const;

export type ColorPalette = {
  [K in keyof typeof lightColors]: string;
};

/** 壳层固定字号（默认 large，以系统默认正文为锚，不叠加系统 fontScale） */
const shellFont = resolveFontMetrics(DEFAULT_FONT_SIZE_PRESET, false);

export const typography = {
  body: shellFont.bodyFontSize,
  bodyLineHeight: shellFont.bodyLineHeight,
  title: shellFont.titleFontSize,
  caption: shellFont.captionFontSize,
  button: shellFont.buttonFontSize,
  small: shellFont.smallFontSize,
};

export function paletteForAppearance(appearance: 'light' | 'dark'): ColorPalette {
  return appearance === 'dark' ? darkColors : lightColors;
}
