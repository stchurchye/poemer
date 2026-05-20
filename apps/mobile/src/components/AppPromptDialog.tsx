import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTextInput } from './AppTextInput';
import { zh } from '../locales/zh-CN';
import { colors } from '../theme/colors';
import { modalStyles } from '../theme/modalStyles';
import { radius, touch } from '../theme/tokens';
import { useLayout } from '../theme/layout';
import { useTextStyles } from '../theme/useTextStyles';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  defaultValue: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
};

export function AppPromptDialog({
  visible,
  title,
  message,
  defaultValue,
  onCancel,
  onConfirm,
}: Props) {
  const text = useTextStyles();
  const { captionFontSize } = useLayout();
  const inputLineHeight = Math.round(captionFontSize * 1.25);
  const inputVerticalPad = Math.max(8, Math.floor((touch.comfort - inputLineHeight) / 2));
  const [draft, setDraft] = useState(defaultValue);

  useEffect(() => {
    if (visible) setDraft(defaultValue);
  }, [visible, defaultValue]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      presentationStyle="overFullScreen"
    >
      <View style={modalStyles.alertBackdrop}>
        <View style={[modalStyles.card, modalStyles.alertCard, styles.card]}>
          <Text style={[text.title, styles.title]}>{title}</Text>
          {message ? (
            <Text style={[text.body, styles.message]}>{message}</Text>
          ) : null}
          <AppTextInput
            value={draft}
            onChangeText={setDraft}
            autoFocus
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              {
                fontSize: captionFontSize,
                lineHeight: inputLineHeight,
                paddingTop: inputVerticalPad,
                paddingBottom: inputVerticalPad,
              },
            ]}
            accessibilityLabel={title}
          />
          <View style={[styles.btnRow, styles.btnRowHorizontal]}>
            <Pressable
              style={({ pressed }) => [styles.btn, styles.btnFlex, pressed && styles.btnPressed]}
              onPress={onCancel}
              accessibilityRole="button"
            >
              <Text style={[text.button, styles.btnLabel]}>{zh.writing.cancel}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.btn, styles.btnFlex, pressed && styles.btnPressed]}
              onPress={() => onConfirm(draft.trim())}
              accessibilityRole="button"
            >
              <Text style={[text.button, styles.btnLabel]}>{zh.common.confirm}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 22,
    borderRadius: radius.md,
  },
  title: {
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    textAlign: 'center',
    color: colors.textMuted,
    marginBottom: 16,
  },
  input: {
    width: '100%',
    minHeight: touch.comfort,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text,
  },
  btnRow: {
    gap: 12,
  },
  btnRowHorizontal: {
    flexDirection: 'row',
  },
  btn: {
    minHeight: touch.comfort,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFlex: {
    flex: 1,
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnLabel: {
    textAlign: 'center',
  },
});
