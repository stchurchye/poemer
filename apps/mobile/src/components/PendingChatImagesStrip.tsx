import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PickedChatImage } from '../lib/pickChatImage';
import type { ColorPalette } from '../theme/colors';
import { radius } from '../theme/tokens';
import { useThemedStyles } from '../theme/useThemedStyles';
import { zh } from '../locales/zh-CN';

type Props = {
  images: PickedChatImage[];
  onRemove: (id: string) => void;
};

const THUMB = 72;

function createPendingChatImagesStripStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      gap: 6,
      paddingHorizontal: 12,
      paddingTop: 4,
    },
    hint: {
      fontSize: 13,
      color: colors.textMuted,
    },
    row: {
      flexDirection: 'row',
      gap: 10,
      paddingBottom: 4,
    },
    thumbWrap: {
      width: THUMB,
      height: THUMB,
      borderRadius: radius.sm,
      overflow: 'hidden',
      backgroundColor: colors.border,
    },
    thumb: {
      width: THUMB,
      height: THUMB,
    },
    removeBtn: {
      position: 'absolute',
      top: 2,
      right: 2,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.imageOverlay,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeText: {
      color: colors.imageOverlayText,
      fontSize: 16,
      lineHeight: 18,
      fontWeight: '600',
    },
  });
}

export function PendingChatImagesStrip({ images, onRemove }: Props) {
  const styles = useThemedStyles(createPendingChatImagesStripStyles);
  if (images.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>{zh.chat.pendingImagesHint}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {images.map((img) => (
          <View key={img.id} style={styles.thumbWrap}>
            <Image source={{ uri: img.uri }} style={styles.thumb} accessibilityIgnoresInvertColors />
            <Pressable
              style={styles.removeBtn}
              onPress={() => onRemove(img.id)}
              accessibilityRole="button"
              accessibilityLabel={zh.chat.removeImage}
              hitSlop={8}
            >
              <Text style={styles.removeText}>×</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
