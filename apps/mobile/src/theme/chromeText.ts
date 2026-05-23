/** 顶栏/标签/芯片等单行文案：统一行高与最小触控高度，避免裁切 */
export const CHROME_LINE_HEIGHT_RATIO = 1.25;
export const CHROME_CHIP_PAD_V = 6;

export function lineHeightForFontSize(
  fontSize: number,
  ratio = CHROME_LINE_HEIGHT_RATIO,
): number {
  return Math.round(fontSize * ratio);
}

export function chipMinHeightForFontSize(
  fontSize: number,
  padV = CHROME_CHIP_PAD_V,
): number {
  return lineHeightForFontSize(fontSize) + padV * 2;
}

/** 横向标签条（章节 Tab 等）容器最小高度 */
export function chromeBarMinHeight(
  fontSize: number,
  barPadV = CHROME_CHIP_PAD_V,
  chipPadV = CHROME_CHIP_PAD_V,
): number {
  return chipMinHeightForFontSize(fontSize, chipPadV) + barPadV * 2;
}
