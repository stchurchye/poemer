import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import type { ColorPalette } from '../theme/colors';
import { useModalStyles } from '../theme/modalStyles';
import { radius } from '../theme/tokens';
import { useTextStyles } from '../theme/useTextStyles';
import { useColors } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { zh } from '../locales/zh-CN';

type Props = {
  visible: boolean;
  message?: string;
};

function createOcrLoadingModalStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: 28,
      minWidth: 240,
      alignItems: 'center',
      gap: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    message: { textAlign: 'center' },
  });
}

export function OcrLoadingModal({ visible, message = zh.writing.ocrRecognizing }: Props) {
  const colors = useColors();
  const modalStyles = useModalStyles();
  const text = useTextStyles();
  const styles = useThemedStyles(createOcrLoadingModalStyles);

  return (
    <Modal visible={visible} transparent animationType="fade" presentationStyle="overFullScreen">
      <View style={[modalStyles.backdrop, { alignItems: 'center', justifyContent: 'center' }]}>
        <View style={styles.card}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.message, text.body]}>{message}</Text>
        </View>
      </View>
    </Modal>
  );
}
