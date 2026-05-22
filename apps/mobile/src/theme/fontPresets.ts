export type FontSizePreset = 'small' | 'medium' | 'large' | 'xlarge';

export type FontChannel = 'article' | 'dialog';

export const FONT_SIZE_PRESETS: FontSizePreset[] = ['small', 'medium', 'large', 'xlarge'];

export const DEFAULT_FONT_SIZE_PRESET: FontSizePreset = 'large';

/** 小助手回复、看一看改稿区等正文的行高倍率（与 replyLineHeight 一致） */
export const REPLY_LINE_HEIGHT_RATIO = 1.22;

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

/** 手机端字号表；默认 large 与现 layout.ts 一致 */
const PHONE_PRESETS: Record<FontSizePreset, FontPresetRow> = {
  small: { title: 30, body: 26, caption: 22, button: 24, small: 20 },
  medium: { title: 33, body: 29, caption: 24, button: 26, small: 22 },
  large: { title: 36, body: 32, caption: 26, button: 28, small: 24 },
  xlarge: { title: 40, body: 36, caption: 30, button: 32, small: 28 },
};

const TABLET_DELTA = 2;

function metricsFromRow(row: FontPresetRow): FontMetrics {
  const bodyFontSize = row.body;
  const bodyLineHeight = Math.round(bodyFontSize * 1.875);
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
  const row = PHONE_PRESETS[preset] ?? PHONE_PRESETS.large;
  return metricsFromRow(isTablet ? bumpRow(row, TABLET_DELTA) : row);
}

export function isFontSizePreset(value: string | null | undefined): value is FontSizePreset {
  return value != null && FONT_SIZE_PRESETS.includes(value as FontSizePreset);
}
