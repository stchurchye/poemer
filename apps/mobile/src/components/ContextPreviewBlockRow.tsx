import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ContextPreviewBlock } from '@shiren/shared';
import { formatTokenCount } from '@shiren/shared';
import { colors } from '../theme/colors';
import { useLayout } from '../theme/layout';
import { zh } from '../locales/zh-CN';

type Props = {
  block: ContextPreviewBlock;
  selected: boolean;
  onToggle: () => void;
};

export function ContextPreviewBlockRow({ block, selected, onToggle }: Props) {
  const { bodyFontSize, captionFontSize, smallFontSize } = useLayout();
  const [expanded, setExpanded] = useState(false);
  const omitted = block.omittedByBudget === true;
  const disabled = !block.selectable || omitted;

  return (
    <View
      style={[
        styles.row,
        block.kind === 'pending_user' && styles.rowPending,
        omitted && styles.rowOmitted,
      ]}
    >
      <Pressable
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
      >
        {block.selectable ? (
          <Pressable
            style={[styles.checkbox, selected && styles.checkboxOn, disabled && styles.checkboxDisabled]}
            onPress={() => {
              if (!disabled) onToggle();
            }}
            hitSlop={10}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected, disabled }}
          >
            {selected ? <Text style={styles.checkMark}>✓</Text> : null}
          </Pressable>
        ) : (
          <View style={styles.checkboxSpacer} />
        )}
        <View style={styles.headerText}>
          <Text
            style={[styles.label, { fontSize: bodyFontSize }, omitted && styles.labelMuted]}
            numberOfLines={1}
          >
            {block.label}
            {omitted ? ` · ${zh.context.omittedByBudget}` : ''}
          </Text>
          <Text style={[styles.tokens, { fontSize: captionFontSize }]}>
            {formatTokenCount(block.tokens)}
          </Text>
        </View>
        <Text style={[styles.chevron, { fontSize: smallFontSize }]}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      {expanded ? (
        <Text
          style={[styles.content, { fontSize: captionFontSize }, omitted && styles.contentMuted]}
          selectable
        >
          {block.content}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 10,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  rowPending: {
    borderColor: colors.insertBorder,
    backgroundColor: colors.insertBg,
  },
  rowOmitted: {
    opacity: 0.55,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    minHeight: 52,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxDisabled: {
    opacity: 0.4,
  },
  checkboxSpacer: {
    width: 28,
    marginRight: 12,
  },
  checkMark: {
    color: colors.onPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontWeight: '600',
    color: colors.text,
  },
  labelMuted: {
    color: colors.textMuted,
  },
  tokens: {
    marginTop: 4,
    color: colors.textMuted,
  },
  chevron: {
    marginLeft: 8,
    color: colors.textMuted,
  },
  content: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    color: colors.text,
    lineHeight: 36,
  },
  contentMuted: {
    color: colors.textMuted,
  },
});
