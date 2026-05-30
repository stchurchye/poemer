import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import type { AssistantGuideKey } from '@shiren/shared';
import { runAssistantGuideAction, type AssistantGuideNav } from '../lib/assistantGuide';
import { zh } from '../locales/zh-CN';
import { typography } from '../theme/colors';

type Props = {
  guideKey: AssistantGuideKey;
  nav?: AssistantGuideNav;
  onJustAsk: () => void;
  disabled?: boolean;
  captionFontSize?: number;
};

export function AssistantGuidePromptBlock({
  guideKey,
  nav,
  onJustAsk,
  disabled,
  captionFontSize = typography.caption,
}: Props) {
  const styles = useThemedStyles(createAssistantGuidePromptBlockStyles);

  const primaryLabel = (zh.guide[guideKey] as { primaryButton: string }).primaryButton;

  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => {
            if (nav) runAssistantGuideAction(guideKey, nav);
          }}
          disabled={disabled || !nav}
        >
          <Text style={[styles.primaryText, { fontSize: captionFontSize }]}>{primaryLabel}</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={onJustAsk} disabled={disabled}>
          <Text style={[styles.secondaryText, { fontSize: captionFontSize }]}>
            {zh.guide.justAsk}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function createAssistantGuidePromptBlockStyles(colors: ColorPalette) {
  return StyleSheet.create({
  block: { marginTop: 12 },
  row: { flexDirection: 'row', gap: 8 },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryText: { color: colors.onPrimary, fontWeight: '600' },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  secondaryText: { color: colors.text, fontWeight: '600' },
});
}
