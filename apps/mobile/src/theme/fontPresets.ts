import { Platform } from 'react-native';

export type FontSizePreset = 'xsmall' | 'small' | 'medium' | 'large' | 'xlarge';

export type FontChannel = 'article' | 'dialog';

export const FONT_SIZE_PRESETS: FontSizePreset[] = [
  'xsmall',
  'small',
  'medium',
  'large',
  'xlarge',
];

export const DEFAULT_FONT_SIZE_PRESET: FontSizePreset = 'large';

/** 小助手回复、看一看改稿区等正文的行高倍率（与 replyLineHeight 一致） */
export const REPLY_LINE_HEIGHT_RATIO = 1.22;

/** 写作正文、历史版本列表等 article 通道多行正文行高倍率（原 1.875 过大，大字档显空） */
export const ARTICLE_LINE_HEIGHT_RATIO = 1.35;

export type FontMetrics = {
  titleFontSize: number;
  bodyFontSize: number;
  bodyLineHeight: number;
  replyLineHeight: number;
  captionFontSize: number;
  buttonFontSize: number;
  smallFontSize: number;
};

type FontPresetRow = {
  title: number;
  body: number;
  caption: number;
  button: number;
  small: number;
};

/** 系统未开启无障碍放大时的默认正文（Android 14sp / iOS 17pt） */
export function getSystemAnchorBodySize(): number {
  return Platform.select({ ios: 17, android: 14, default: 16 })!;
}

/**
 * 各档相对系统默认正文（14sp）的倍率；锚点仅用于换算像素，不改变「最小→最大」顺序。
 * 与改版前绝对字号一致：22 / 26 / 29 / 32 / 36（Android）。
 */
const PRESET_SCALE: Record<FontSizePreset, FontPresetRow> = {
  xsmall: { title: 26 / 14, body: 22 / 14, caption: 18 / 14, button: 20 / 14, small: 16 / 14 },
  small: { title: 30 / 14, body: 26 / 14, caption: 22 / 14, button: 24 / 14, small: 20 / 14 },
  medium: { title: 33 / 14, body: 29 / 14, caption: 24 / 14, button: 26 / 14, small: 22 / 14 },
  large: { title: 36 / 14, body: 32 / 14, caption: 26 / 14, button: 28 / 14, small: 24 / 14 },
  xlarge: { title: 40 / 14, body: 36 / 14, caption: 30 / 14, button: 32 / 14, small: 28 / 14 },
};

const TABLET_DELTA = 2;

function rowFromAnchorScale(preset: FontSizePreset): FontPresetRow {
  const anchor = getSystemAnchorBodySize();
  const scale = PRESET_SCALE[preset] ?? PRESET_SCALE.large;
  return {
    title: Math.round(anchor * scale.title),
    body: Math.round(anchor * scale.body),
    caption: Math.round(anchor * scale.caption),
    button: Math.round(anchor * scale.button),
    small: Math.round(anchor * scale.small),
  };
}

function metricsFromRow(row: FontPresetRow): FontMetrics {
  const bodyFontSize = row.body;
  const bodyLineHeight = Math.round(bodyFontSize * ARTICLE_LINE_HEIGHT_RATIO);
  return {
    titleFontSize: row.title,
    bodyFontSize,
    bodyLineHeight,
    replyLineHeight: Math.round(bodyFontSize * REPLY_LINE_HEIGHT_RATIO),
    captionFontSize: row.caption,
    buttonFontSize: row.button,
    smallFontSize: row.small,
  };
}

function bumpRow(row: FontPresetRow, delta: number): FontPresetRow {
  return {
    title: row.title + delta,
    body: row.body + delta,
    caption: row.caption + delta,
    button: row.button + delta,
    small: row.small + delta,
  };
}

export function resolveFontMetrics(
  preset: FontSizePreset,
  isTablet: boolean,
): FontMetrics {
  const row = rowFromAnchorScale(preset);
  return metricsFromRow(isTablet ? bumpRow(row, TABLET_DELTA) : row);
}

export function isFontSizePreset(value: string | null | undefined): value is FontSizePreset {
  return value != null && FONT_SIZE_PRESETS.includes(value as FontSizePreset);
}
