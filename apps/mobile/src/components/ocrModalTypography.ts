import { useTypography } from '../theme/layout';

/** OCR 流程弹窗说明文字行高（较 dialog hint 默认 1.875× 更紧凑） */
export const OCR_MODAL_HINT_LINE_HEIGHT_RATIO = 1.28;

export function useOcrModalHintLineHeight(): number {
  const { captionFontSize } = useTypography('dialog');
  return Math.round(captionFontSize * OCR_MODAL_HINT_LINE_HEIGHT_RATIO);
}
