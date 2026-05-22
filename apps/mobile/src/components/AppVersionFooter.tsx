import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { formatAppVersionFooterLines, getAppVersionInfo } from '../lib/appVersionInfo';
import { colors, typography } from '../theme/colors';

export function AppVersionFooter() {
  const [lines, setLines] = useState(() =>
    formatAppVersionFooterLines(getAppVersionInfo()),
  );

  useFocusEffect(
    useCallback(() => {
      setLines(formatAppVersionFooterLines(getAppVersionInfo()));
    }, []),
  );

  return (
    <View style={styles.wrap}>
      {lines.map((line) => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    paddingTop: 20,
    paddingBottom: 8,
    alignItems: 'center',
    gap: 4,
  },
  line: {
    fontSize: typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: Math.round(typography.small * 1.45),
  },
});
