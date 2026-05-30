import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useLayout } from '../theme/layout';
import { zh } from '../locales/zh-CN';

type Props = {
  visible: boolean;
  onClose: () => void;
  onComposeContext: () => void;
};

export function ContextHubSheet({ visible, onClose, onComposeContext }: Props) {
  const styles = useThemedStyles(createContextHubSheetStyles);

  const { titleFontSize, bodyFontSize, captionFontSize } = useLayout();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.title, { fontSize: titleFontSize }]}>{zh.context.hubTitle}</Text>
          <Text style={[styles.hint, { fontSize: captionFontSize }]}>{zh.chat.composeContextHint}</Text>

          <Pressable
            style={styles.action}
            onPress={() => {
              onClose();
              onComposeContext();
            }}
          >
            <Text style={[styles.actionTitle, { fontSize: bodyFontSize }]}>
              {zh.chat.composeContext}
            </Text>
            <Text style={[styles.actionHint, { fontSize: captionFontSize }]}>
              {zh.chat.composeContextHint}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createContextHubSheetStyles(colors: ColorPalette) {
  return StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.backdrop,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    gap: 12,
  },
  title: {
    fontWeight: '700',
    color: colors.text,
  },
  hint: {
    color: colors.textMuted,
    lineHeight: 32,
  },
  action: {
    marginTop: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  actionTitle: {
    fontWeight: '700',
    color: colors.text,
  },
  actionHint: {
    marginTop: 6,
    color: colors.textMuted,
    lineHeight: 32,
  },
});
}
