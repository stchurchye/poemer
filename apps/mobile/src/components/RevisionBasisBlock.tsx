import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { RevisionBasisDisplay } from '../lib/revisionBasis';

type Props = {
  basis: RevisionBasisDisplay | null;
  bodyFontSize: number;
  bodyLineHeight: number;
};

/** 对话气泡内只展示评价与理由正文，不显示标题、小节名与改稿方式/范围 */
export function RevisionBasisBlock({ basis, bodyFontSize, bodyLineHeight }: Props) {
  if (!basis?.evaluation && !basis?.rationale) return null;

  return (
    <View style={styles.wrap}>
      {basis.evaluation ? (
        <Text style={[styles.value, { fontSize: bodyFontSize, lineHeight: bodyLineHeight }]}>
          {basis.evaluation}
        </Text>
      ) : null}
      {basis.rationale ? (
        <Text style={[styles.value, { fontSize: bodyFontSize, lineHeight: bodyLineHeight }]}>
          {basis.rationale}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    paddingTop: 4,
    paddingBottom: 2,
  },
  value: { color: colors.text },
});
