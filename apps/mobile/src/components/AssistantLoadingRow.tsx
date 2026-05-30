import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import type { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useElapsedSeconds } from '../hooks/useElapsedSeconds';
import { formatElapsedSeconds } from '../lib/formatElapsedSeconds';

type Props = {
  label: string;
  active: boolean;
  rowStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  spinnerSize?: 'small' | 'large';
};

function createAssistantLoadingRowStyles(colors: ColorPalette) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    text: { flex: 1, color: colors.textMuted, fontWeight: '600' },
  });
}

export function AssistantLoadingRow({
  label,
  active,
  rowStyle,
  textStyle,
  spinnerSize = 'small',
}: Props) {
  const colors = useColors();
  const styles = useThemedStyles(createAssistantLoadingRowStyles);
  const elapsed = useElapsedSeconds(active);
  const suffix = active ? ` · ${formatElapsedSeconds(elapsed)}` : '';

  return (
    <View style={[styles.row, rowStyle]}>
      <ActivityIndicator color={colors.primary} size={spinnerSize} />
      <Text style={[styles.text, textStyle]} numberOfLines={2}>
        {label}
        {suffix}
      </Text>
    </View>
  );
}

/** 气泡内 pending 文案（无转圈，外层已有 ActivityIndicator） */
export function LoadingLabel({
  label,
  active,
  style,
}: {
  label: string;
  active: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const elapsed = useElapsedSeconds(active);
  const suffix = active ? ` · ${formatElapsedSeconds(elapsed)}` : '';
  return (
    <Text style={style} numberOfLines={3}>
      {label}
      {suffix}
    </Text>
  );
}
