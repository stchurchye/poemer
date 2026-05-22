import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';
import { radius } from '../theme/tokens';

type Props = {
  uris: string[];
};

const THUMB = 112;

/** 问问题用户气泡内展示本轮上传的图片（仅展示，不进后续 LLM 上下文） */
export function ChatUserMessageImages({ uris }: Props) {
  if (uris.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {uris.map((uri, index) => (
          <Image
            key={`${uri}-${index}`}
            source={{ uri }}
            style={styles.thumb}
            accessibilityIgnoresInvertColors
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
    marginHorizontal: -2,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
});
