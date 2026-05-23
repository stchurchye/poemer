import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { useLayout } from '../theme/layout';

type Props = {
  title: string;
};

export function ContextPreviewSectionHeader({ title }: Props) {
  const { bodyFontSize } = useLayout();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { fontSize: bodyFontSize }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    marginBottom: 6,
  },
  title: {
    fontWeight: '700',
    color: colors.text,
  },
});
