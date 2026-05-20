import { Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ContextUsage } from '@shiren/shared';
import { formatTokenCount, getContextBreakdownSegments } from '@shiren/shared';
import { colors } from '../theme/colors';
import { useLayout } from '../theme/layout';
import { zh } from '../locales/zh-CN';

type ContentProps = {
  usage: ContextUsage;
  cardStyle?: StyleProp<ViewStyle>;
  onCompact?: () => void;
  compactBusy?: boolean;
};

export function ContextUsageDetailContent({ usage, cardStyle, onCompact, compactBusy }: ContentProps) {
  const { bodyFontSize, smallFontSize } = useLayout();
  const percent = Math.round(usage.ratio * 100);
  const segments = getContextBreakdownSegments(usage.breakdown);
  const totalSegmentTokens = segments.reduce((s, seg) => s + seg.tokens, 0);

  return (
    <View style={[styles.card, cardStyle]}>
      <View style={styles.summaryRow}>
        <Text style={[styles.percentText, { fontSize: bodyFontSize }]}>
          {zh.context.percentUsed(percent)}
        </Text>
        <Text style={[styles.tokensText, { fontSize: smallFontSize }]}>
          {zh.context.tokensSummary(
            formatTokenCount(usage.usedTokens),
            formatTokenCount(usage.limitTokens),
          )}
        </Text>
      </View>

      <View style={styles.segmentTrack}>
        {segments.map((seg) => {
          const widthPct =
            totalSegmentTokens > 0 ? (seg.tokens / totalSegmentTokens) * 100 : 0;
          return (
            <View
              key={seg.key}
              style={[styles.segment, { width: `${widthPct}%`, backgroundColor: seg.color }]}
            />
          );
        })}
      </View>

      <View style={styles.legend}>
        {segments.map((seg) => (
          <View key={seg.key} style={styles.legendRow}>
            <View style={styles.legendLeft}>
              <View style={[styles.swatch, { backgroundColor: seg.color }]} />
              <Text style={[styles.legendLabel, { fontSize: smallFontSize }]}>{seg.labelZh}</Text>
            </View>
            <Text style={[styles.legendValue, { fontSize: smallFontSize }]}>
              {formatTokenCount(seg.tokens)}
            </Text>
          </View>
        ))}
      </View>

      {usage.compacted ? (
        <Text style={[styles.hint, { fontSize: smallFontSize }]}>{zh.context.compactedHint}</Text>
      ) : null}

      {onCompact ? (
        <Pressable
          style={[styles.compactBtn, compactBusy && styles.compactBtnDisabled]}
          onPress={onCompact}
          disabled={compactBusy}
          accessibilityRole="button"
          accessibilityLabel={zh.context.compactAction}
        >
          <Text style={[styles.compactBtnText, { fontSize: smallFontSize }]}>
            {compactBusy ? zh.context.compacting : zh.context.compactAction}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type Props = {
  visible: boolean;
  usage: ContextUsage | null;
  onClose: () => void;
  inline?: boolean;
  onCompact?: () => void;
  compactBusy?: boolean;
};

export function ContextUsageDetailModal({
  visible,
  usage,
  onClose,
  inline,
  onCompact,
  compactBusy,
}: Props) {
  const { titleFontSize, bodyFontSize } = useLayout();
  if (!visible || !usage) return null;

  if (inline) {
    return (
      <Pressable
        style={styles.inlineCard}
        onPress={(e) => e.stopPropagation()}
        accessibilityViewIsModal
      >
        <View style={styles.inlineHeader}>
          <Text style={[styles.inlineTitle, { fontSize: titleFontSize }]}>{zh.context.detailTitle}</Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={zh.context.close}
          >
            <Text style={[styles.inlineClose, { fontSize: bodyFontSize }]}>✕</Text>
          </Pressable>
        </View>
        <ContextUsageDetailContent
          usage={usage}
          cardStyle={styles.inlineBody}
          onCompact={onCompact}
          compactBusy={compactBusy}
        />
      </Pressable>
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalRoot} onPress={onClose}>
        <Pressable
          style={[styles.inlineCard, styles.modalCard]}
          onPress={(e) => e.stopPropagation()}
          accessibilityViewIsModal
        >
          <View style={styles.inlineHeader}>
            <Text style={[styles.inlineTitle, { fontSize: titleFontSize }]}>{zh.context.detailTitle}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={zh.context.close}
            >
              <Text style={[styles.inlineClose, { fontSize: bodyFontSize }]}>✕</Text>
            </Pressable>
          </View>
          <ContextUsageDetailContent
            usage={usage}
            cardStyle={styles.inlineBody}
            onCompact={onCompact}
            compactBusy={compactBusy}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'transparent',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  modalCard: {
    maxWidth: 624,
    width: '92%',
  },
  inlineCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  inlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  inlineTitle: {
    fontWeight: '700',
    color: colors.text,
  },
  inlineClose: {
    color: colors.textMuted,
    paddingHorizontal: 4,
  },
  inlineBody: {
    borderWidth: 0,
    borderRadius: 0,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  percentText: {
    fontWeight: '700',
    color: colors.text,
    flexShrink: 0,
  },
  tokensText: {
    fontWeight: '600',
    color: colors.textMuted,
    flexShrink: 1,
    textAlign: 'right',
  },
  segmentTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: colors.border,
    marginBottom: 14,
  },
  segment: {
    height: '100%',
    minWidth: 2,
  },
  legend: {
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  legendLabel: {
    color: colors.text,
    fontWeight: '500',
  },
  legendValue: {
    color: colors.textMuted,
    fontWeight: '600',
    flexShrink: 0,
  },
  hint: {
    marginTop: 12,
    color: colors.textMuted,
    lineHeight: 34,
  },
  compactBtn: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
  },
  compactBtnDisabled: {
    opacity: 0.5,
  },
  compactBtnText: {
    color: colors.primary,
    fontWeight: '700',
  },
});
