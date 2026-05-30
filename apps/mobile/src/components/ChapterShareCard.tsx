import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { lightColors, type ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';

/** 小红书等竖屏长图常用宽度（逻辑像素） */
export const SHARE_CARD_WIDTH = 750;

type Props = {
  documentTitle: string;
  chapterTitle: string;
  body: string;
  /** 导出长图时固定浅色；界面预览跟随主题 */
  palette?: ColorPalette;
};

function createShareCardStyles(palette: ColorPalette) {
  return StyleSheet.create({
    card: {
      width: SHARE_CARD_WIDTH,
      backgroundColor: palette.background,
      paddingHorizontal: 56,
      paddingTop: 72,
      paddingBottom: 72,
    },
    docTitle: {
      fontSize: 34,
      color: palette.textMuted,
      letterSpacing: 1,
      marginBottom: 12,
    },
    chapterTitle: {
      fontSize: 52,
      fontWeight: '700',
      color: palette.text,
      lineHeight: 64,
      marginBottom: 8,
    },
    rule: {
      height: 1,
      backgroundColor: palette.shareRuleDecor,
      marginTop: 28,
      marginBottom: 36,
    },
    body: {
      gap: 28,
    },
    paragraph: {
      fontSize: 40,
      lineHeight: 62,
      color: palette.text,
      letterSpacing: 0.5,
    },
  });
}

export function ChapterShareCard({
  documentTitle,
  chapterTitle,
  body,
  palette: paletteProp,
}: Props) {
  const themeColors = useColors();
  const palette = paletteProp ?? themeColors;
  const styles = useMemo(() => createShareCardStyles(palette), [palette]);

  const paragraphs = body
    .trim()
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <View style={styles.card} collapsable={false}>
      <Text style={styles.docTitle}>{documentTitle}</Text>
      <Text style={styles.chapterTitle}>{chapterTitle}</Text>
      <View style={styles.rule} />
      <View style={styles.body}>
        {paragraphs.map((paragraph, index) => (
          <Text key={index} style={styles.paragraph}>
            {'　　'}
            {paragraph}
          </Text>
        ))}
      </View>
    </View>
  );
}

export { lightColors };
