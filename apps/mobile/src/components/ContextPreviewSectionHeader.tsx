import { StyleSheet, Text, View } from 'react-native';
import type { ColorPalette } from '../theme/colors';
import { useLayout } from '../theme/layout';
import { useThemedStyles } from '../theme/useThemedStyles';

type Props = {
  title: string;
};

function createContextPreviewSectionHeaderStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      marginTop: 12,
      marginBottom: 6,
    },
    title: {
      fontWeight: '700',
      color: colors.text,
    },
  });
}

export function ContextPreviewSectionHeader({ title }: Props) {
  const { bodyFontSize } = useLayout();
  const styles = useThemedStyles(createContextPreviewSectionHeaderStyles);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { fontSize: bodyFontSize }]}>{title}</Text>
    </View>
  );
}
