import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { copyTextToClipboard } from '../lib/copyToClipboard';
import { colors, typography } from '../theme/colors';
import { useTypography } from '../theme/layout';
import { zh } from '../locales/zh-CN';

type Props = {
  rawText: string;
  displayText: string;
  source: 'text' | 'voice';
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
  confirmTitle?: string;
  cancelTitle?: string;
};

export function ChatIntentConfirmBar({
  rawText,
  displayText,
  source,
  onConfirm,
  onCancel,
  disabled,
  confirmTitle = zh.chat.intentConfirm,
  cancelTitle = zh.chat.intentCancel,
}: Props) {
  const { bodyFontSize, bodyLineHeight, captionFontSize } = useTypography('dialog');

  return (
    <View style={styles.box}>
      {source === 'voice' ? (
        <>
          <Text style={[styles.label, { fontSize: captionFontSize }]}>{zh.chat.intentYouSaid}</Text>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            <Text
              style={[styles.body, { fontSize: bodyFontSize, lineHeight: bodyLineHeight }]}
              onLongPress={() => void copyTextToClipboard(rawText)}
              accessibilityHint={zh.common.longPressToCopy}
            >
              {rawText}
            </Text>
          </ScrollView>
        </>
      ) : null}
      <Text style={[styles.label, { fontSize: captionFontSize, marginTop: source === 'voice' ? 10 : 0 }]}>
        {zh.chat.intentUnderstand}
      </Text>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={[styles.body, { fontSize: bodyFontSize, lineHeight: bodyLineHeight }]}
          onLongPress={() => void copyTextToClipboard(displayText)}
          accessibilityHint={zh.common.longPressToCopy}
        >
          {displayText}
        </Text>
      </ScrollView>
      <View style={styles.actions}>
        <PrimaryButton
          title={confirmTitle}
          onPress={onConfirm}
          disabled={disabled}
          style={styles.btn}
        />
        <PrimaryButton
          title={cancelTitle}
          variant="secondary"
          onPress={onCancel}
          disabled={disabled}
          style={styles.btn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.intentConfirmBg,
    padding: 28,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  label: {
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: 12,
  },
  scroll: {
    maxHeight: 240,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.intentConfirmTextBg,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  body: { color: colors.text },
  actions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  btn: { flex: 1 },
});
