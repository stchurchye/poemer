import { Platform, StyleSheet, type TextStyle } from 'react-native';
import { colors } from './colors';

const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export function buildMessageMarkdownStyles(params: {
  bodyFontSize: number;
  bodyLineHeight: number;
  captionFontSize: number;
  paragraphMarginBottom?: number;
}): Record<string, TextStyle | object> {
  const { bodyFontSize, bodyLineHeight, captionFontSize, paragraphMarginBottom = 10 } = params;
  const codeSize = Math.max(Math.round(bodyFontSize * 0.82), 18);
  const codeLine = Math.round(codeSize * 1.45);
  const headingScale = (ratio: number) => Math.round(bodyFontSize * ratio);

  return StyleSheet.create({
    body: {
      color: colors.text,
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: paragraphMarginBottom,
    },
    text: {
      color: colors.text,
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
    },
    strong: {
      fontWeight: '700',
      color: colors.text,
    },
    em: {
      fontStyle: 'italic',
    },
    s: {
      textDecorationLine: 'line-through',
      color: colors.textMuted,
    },
    heading1: {
      fontSize: headingScale(1.15),
      lineHeight: Math.round(bodyLineHeight * 1.1),
      fontWeight: '700',
      color: colors.text,
      marginTop: 8,
      marginBottom: 8,
    },
    heading2: {
      fontSize: headingScale(1.08),
      lineHeight: Math.round(bodyLineHeight * 1.05),
      fontWeight: '700',
      color: colors.text,
      marginTop: 8,
      marginBottom: 6,
    },
    heading3: {
      fontSize: headingScale(1.02),
      lineHeight: bodyLineHeight,
      fontWeight: '700',
      color: colors.text,
      marginTop: 6,
      marginBottom: 4,
    },
    heading4: {
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
      fontWeight: '700',
      color: colors.text,
    },
    heading5: {
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
      fontWeight: '600',
      color: colors.textMuted,
    },
    heading6: {
      fontSize: captionFontSize,
      lineHeight: Math.round(captionFontSize * 1.5),
      fontWeight: '600',
      color: colors.textMuted,
    },
    bullet_list: {
      marginBottom: 8,
    },
    ordered_list: {
      marginBottom: 8,
    },
    list_item: {
      flexDirection: 'row',
      marginBottom: 4,
    },
    bullet_list_icon: {
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
      color: colors.primary,
      marginRight: 8,
    },
    ordered_list_icon: {
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
      color: colors.primary,
      marginRight: 8,
      fontWeight: '600',
    },
    blockquote: {
      backgroundColor: colors.primarySoft,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginVertical: 8,
    },
    code_inline: {
      fontFamily: mono,
      fontSize: codeSize,
      lineHeight: codeLine,
      backgroundColor: colors.primarySoft,
      color: colors.text,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    fence: {
      fontFamily: mono,
      fontSize: codeSize,
      lineHeight: codeLine,
      backgroundColor: '#2d2a28',
      color: '#f5f0ea',
      padding: 12,
      borderRadius: 10,
      marginVertical: 8,
      overflow: 'hidden',
    },
    code_block: {
      fontFamily: mono,
      fontSize: codeSize,
      lineHeight: codeLine,
      backgroundColor: '#2d2a28',
      color: '#f5f0ea',
      padding: 12,
      borderRadius: 10,
      marginVertical: 8,
    },
    link: {
      color: colors.primary,
      textDecorationLine: 'underline',
      fontWeight: '600',
    },
    hr: {
      backgroundColor: colors.border,
      height: 1,
      marginVertical: 12,
    },
    table: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      marginVertical: 8,
      overflow: 'hidden',
    },
    thead: {
      backgroundColor: colors.primarySoft,
    },
    tbody: {},
    tr: {
      borderBottomWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
    },
    th: {
      flex: 1,
      padding: 8,
      fontWeight: '700',
      fontSize: captionFontSize,
      color: colors.text,
    },
    td: {
      flex: 1,
      padding: 8,
      fontSize: captionFontSize,
      color: colors.text,
    },
  });
}
