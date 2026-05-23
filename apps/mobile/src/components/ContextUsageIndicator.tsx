import { StyleSheet, Text, View } from 'react-native';
import type { ContextUsage } from '@shiren/shared';
import { contextUsageForDisplay, formatTokenCount } from '@shiren/shared';
import { colors, typography } from '../theme/colors';
import { zh } from '../locales/zh-CN';

type Props = {
  usage: ContextUsage | null;
  loading?: boolean;
};

export function ContextUsageIndicator({ usage, loading }: Props) {
  if (loading && !usage) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>{zh.context.usageLoading}</Text>
      </View>
    );
  }
  if (!usage) return null;

  const display = contextUsageForDisplay(usage);
  const percent = Math.round(display.ratio * 100);
  const barColor =
    percent >= 85 ? colors.error : percent >= 70 ? colors.primary : colors.primaryMutedText;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>{zh.context.usageLabel}</Text>
        <Text style={styles.numbers}>
          {formatTokenCount(display.usedTokens)} / {formatTokenCount(display.limitTokens)} · {percent}%
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(100, percent)}%`, backgroundColor: barColor }]} />
      </View>
      {display.compacted ? (
        <Text style={styles.hint}>{zh.context.compactedHint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    fontSize: typography.small,
    color: colors.textMuted,
    fontWeight: '600',
  },
  numbers: {
    fontSize: typography.small,
    color: colors.text,
    fontWeight: '600',
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  hint: {
    fontSize: typography.small,
    color: colors.textMuted,
    lineHeight: Math.round(typography.small * 1.4),
  },
});
