import { DEFAULT_FONT_SIZE_PRESET, resolveFontMetrics } from './fontPresets';

export const colors = {
  background: '#f5f7fa',
  surface: '#ffffff',
  text: '#1a1a1a',
  textMuted: '#8a8a9a',
  primary: '#4e6ef2',
  primarySoft: '#eef1fd',
  /** 小助手回复区（极浅蓝灰，不刺眼） */
  assistantBg: '#f0f2f8',
  /** 问答案意图确认条外层卡片 */
  intentConfirmBg: '#eef1f6',
  /** 问答案意图确认条内文字区 */
  intentConfirmTextBg: '#e3e6ee',
  /** 主色按钮上的文字 */
  onPrimary: '#ffffff',
  /** 弹窗遮罩 */
  backdrop: 'rgba(0, 0, 10, 0.45)',
  /** 主色浅描边 */
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
};

/** 壳层固定字号（默认 large，以系统默认正文为锚，不叠加系统 fontScale） */
const shellFont = resolveFontMetrics(DEFAULT_FONT_SIZE_PRESET, false);

export const typography = {
  body: shellFont.bodyFontSize,
  bodyLineHeight: shellFont.bodyLineHeight,
  title: shellFont.titleFontSize,
  caption: shellFont.captionFontSize,
  button: shellFont.buttonFontSize,
  /** 次要说明、工具栏短文案 */
  small: shellFont.smallFontSize,
};
