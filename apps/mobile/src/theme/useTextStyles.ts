import { useMemo } from 'react';
import type { TextStyle } from 'react-native';
import { colors } from './colors';
import type { FontChannel } from './fontPresets';
import { useTypography } from './layout';

export type TextRole = 'title' | 'body' | 'reply' | 'caption' | 'button' | 'hint' | 'small';

/** 按角色返回响应式文字样式（同类型同样式） */
export function useTextStyles(channel: FontChannel = 'dialog') {
  const {
    titleFontSize,
    bodyFontSize,
    bodyLineHeight,
    replyLineHeight,
    captionFontSize,
    buttonFontSize,
    smallFontSize,
  } = useTypography(channel);

  return useMemo(() => {
    const lineFor = (size: number) => Math.round(size * 1.875);

    const title: TextStyle = {
      fontSize: titleFontSize,
      lineHeight: lineFor(titleFontSize),
      fontWeight: '700',
      color: colors.text,
    };
    const body: TextStyle = {
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
      color: colors.text,
    };
    const reply: TextStyle = {
      fontSize: bodyFontSize,
      lineHeight: replyLineHeight,
      color: colors.text,
    };
    const caption: TextStyle = {
      fontSize: captionFontSize,
      lineHeight: lineFor(captionFontSize),
      color: colors.textMuted,
    };
    const button: TextStyle = {
      fontSize: buttonFontSize,
      lineHeight: lineFor(buttonFontSize),
      fontWeight: '600',
      color: colors.text,
    };
    const hint: TextStyle = {
      fontSize: captionFontSize,
      lineHeight: lineFor(captionFontSize),
      color: colors.textMuted,
    };
    const small: TextStyle = {
      fontSize: smallFontSize,
      lineHeight: lineFor(smallFontSize),
      fontWeight: '600',
      color: colors.text,
    };

    return { title, body, reply, caption, button, hint, small };
  }, [
    titleFontSize,
    bodyFontSize,
    bodyLineHeight,
    replyLineHeight,
    captionFontSize,
    buttonFontSize,
    smallFontSize,
  ]);
}
