import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DiffSegment } from '@shiren/shared';
import { colors, typography } from '../theme/colors';
import { lineHeightForFontSize } from '../theme/chromeText';
import { zh } from '../locales/zh-CN';

interface Props {
  segments: DiffSegment[];
  comment?: string;
  bodyFontSize?: number;
  bodyLineHeight?: number;
  hideComment?: boolean;
  /** 单行图例，版面更清爽 */
  compact?: boolean;
  /** 嵌入「看一看」面板：去掉外层卡片，字号与右侧正文一致 */
  embedded?: boolean;
}

/** 限制嵌套 Text 数量，避免长文 diff 卡死 UI */
const MAX_DIFF_TEXT_NODES = 160;

function coalesceSegmentsForRender(segments: DiffSegment[]): DiffSegment[] {
  if (segments.length <= MAX_DIFF_TEXT_NODES) return segments;
  const out: DiffSegment[] = [];
  const chunk = Math.ceil(segments.length / MAX_DIFF_TEXT_NODES);
  for (let i = 0; i < segments.length; i += chunk) {
    const slice = segments.slice(i, i + chunk);
    const type = slice[0].type;
    let text = '';
    for (const seg of slice) {
      if (seg.type === type) text += seg.text;
    }
    if (text) out.push({ type, text });
  }
  return mergeAdjacentSegments(out);
}

function mergeAdjacentSegments(segments: DiffSegment[]): DiffSegment[] {
  const result: DiffSegment[] = [];
  for (const seg of segments) {
    const last = result[result.length - 1];
    if (last && last.type === seg.type) {
      last.text += seg.text;
    } else if (seg.text) {
      result.push({ ...seg });
    }
  }
  return result;
}

export function DiffView({
  segments,
  comment,
  bodyFontSize,
  bodyLineHeight,
  hideComment,
  compact,
  embedded,
}: Props) {
  const bodySize = bodyFontSize ?? typography.body;
  const lineHeight =
    bodyLineHeight ?? Math.round(bodySize * 1.22);
  const legendSize = embedded ? bodySize - 2 : compact ? typography.caption : typography.button;
  const renderSegments = useMemo(
    () => coalesceSegmentsForRender(segments),
    [segments],
  );

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact, embedded && styles.wrapEmbedded]}>
      {compact || embedded ? (
        <Text
          style={[
            styles.legendCompact,
            embedded && styles.legendEmbedded,
            { fontSize: legendSize, lineHeight },
          ]}
        >
          {zh.diff.legendCompact}
        </Text>
      ) : (
        <View style={styles.legendRow}>
          <View style={styles.legendChip}>
            <Text style={styles.legendSampleInsert}>{zh.diff.legendInsertSample}</Text>
            <Text style={styles.legendLabel}>{zh.diff.legendInsert}</Text>
          </View>
          <View style={styles.legendChip}>
            <Text style={styles.legendSampleDelete}>{zh.diff.legendDeleteSample}</Text>
            <Text style={styles.legendLabel}>{zh.diff.legendDelete}</Text>
          </View>
        </View>
      )}

      {comment && !hideComment ? (
        <View style={styles.commentBox}>
          <Text style={[styles.comment, { fontSize: bodySize, lineHeight }]}>{comment}</Text>
        </View>
      ) : null}

      <View
        style={[
          styles.bodyCard,
          compact && styles.bodyCardCompact,
          embedded && styles.bodyCardEmbedded,
        ]}
      >
        <Text style={[styles.body, { fontSize: bodySize, lineHeight }]}>
          {renderSegments.map((seg, i) => {
            if (seg.type === 'equal') {
              return (
                <Text key={i} style={styles.equal}>
                  {seg.text}
                </Text>
              );
            }
            if (seg.type === 'insert') {
              return (
                <Text key={i} style={styles.insert}>
                  {seg.text}
                </Text>
              );
            }
            return (
              <Text key={i} style={styles.delete}>
                {seg.text}
              </Text>
            );
          })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 20 },
  wrapCompact: { gap: 10 },
  wrapEmbedded: { gap: 8 },
  legendCompact: { color: colors.textMuted },
  legendEmbedded: { color: colors.textMuted, marginBottom: 4 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legendSampleInsert: {
    fontSize: typography.caption,
    lineHeight: lineHeightForFontSize(typography.caption),
    fontWeight: '700',
    color: colors.insertText,
    backgroundColor: colors.insertBg,
    borderWidth: 1,
    borderColor: colors.insertBorder,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  legendSampleDelete: {
    fontSize: typography.caption,
    lineHeight: lineHeightForFontSize(typography.caption),
    fontWeight: '600',
    color: colors.deleteText,
    backgroundColor: colors.deleteBg,
    borderWidth: 1,
    borderColor: colors.deleteBorder,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    textDecorationLine: 'line-through',
  },
  legendLabel: {
    fontSize: typography.caption,
    lineHeight: lineHeightForFontSize(typography.caption),
    color: colors.textMuted,
  },
  commentBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  comment: { color: colors.text, fontWeight: '600' },
  bodyCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bodyCardCompact: {
    padding: 18,
    borderRadius: 14,
  },
  bodyCardEmbedded: {
    padding: 0,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  body: { color: colors.text },
  equal: { color: colors.text },
  insert: {
    color: colors.insertText,
    backgroundColor: colors.insertBg,
    borderRadius: 4,
    borderBottomWidth: 2,
    borderBottomColor: colors.insertBorder,
  },
  delete: {
    color: colors.deleteText,
    backgroundColor: colors.deleteBg,
    textDecorationLine: 'line-through',
    textDecorationStyle: 'solid',
    borderRadius: 4,
    borderBottomWidth: 2,
    borderBottomColor: colors.deleteBorder,
  },
});
