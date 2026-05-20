import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { appAlert } from '../lib/appAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDashScopeApiKey } from '../lib/dashscopeKey';
import { getDeepSeekApiKey } from '../lib/deepseekKey';
import { getZenMuxApiKey } from '../lib/zenmuxKey';
import type { MeStackParamList } from '../navigation/types';
import {
  getStoredDialect,
  getStoredVoiceId,
  listVoicesForDialect,
  setStoredDialect,
  setStoredVoiceId,
  speakText,
  ttsVoiceOptionId,
  ttsVoiceOptionLabel,
  type TtsDialect,
  type TtsVoiceOption,
} from '../lib/tts';
import { FontSizePresetPicker } from '../components/FontSizePresetPicker';
import { TabletFrame } from '../components/TabletFrame';
import { colors, typography } from '../theme/colors';
import { useFontPreferences } from '../theme/FontPreferencesContext';
import type { FontSizePreset } from '../theme/fontPresets';
import { useLayout } from '../theme/layout';
import { zh } from '../locales/zh-CN';

export function MeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MeStackParamList, 'MeMain'>>();
  const insets = useSafeAreaInsets();
  const { isTablet, bodyFontSize, width, buttonFontSize, captionFontSize } = useLayout();
  const { articlePreset, dialogPreset, setArticlePreset, setDialogPreset } = useFontPreferences();
  const mePadX = isTablet ? 20 : 12;
  const [keysConfiguredCount, setKeysConfiguredCount] = useState(0);
  const [dialect, setDialect] = useState<TtsDialect>('mandarin');
  const [voices, setVoices] = useState<TtsVoiceOption[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);

  const refreshKeysSummary = useCallback(async () => {
    const [deepseek, zenmux, dashscope] = await Promise.all([
      getDeepSeekApiKey(),
      getZenMuxApiKey(),
      getDashScopeApiKey(),
    ]);
    setKeysConfiguredCount([deepseek, zenmux, dashscope].filter(Boolean).length);
  }, []);

  const loadVoices = useCallback(async (d: TtsDialect) => {
    const [list, stored, currentDialect] = await Promise.all([
      listVoicesForDialect(d),
      getStoredVoiceId(d),
      getStoredDialect(),
    ]);
    setDialect(currentDialect);
    setVoices(list);
    const validStored =
      stored && list.some((v) => ttsVoiceOptionId(v) === stored) ? stored : null;
    const pick = validStored ?? (list[0] ? ttsVoiceOptionId(list[0]) : null);
    if (pick && pick !== stored) {
      await setStoredVoiceId(d, pick);
    }
    setSelectedVoiceId(pick);
  }, []);

  useEffect(() => {
    void getStoredDialect().then((d) => loadVoices(d));
  }, [loadVoices]);

  useFocusEffect(
    useCallback(() => {
      void refreshKeysSummary();
      void getStoredDialect().then((d) => loadVoices(d));
    }, [refreshKeysSummary, loadVoices]),
  );

  const selectDialect = async (next: TtsDialect) => {
    await setStoredDialect(next);
    setDialect(next);
    await loadVoices(next);
    appAlert('已保存', zh.me.dialectSaved);
  };

  const selectVoice = async (voiceId: string) => {
    await setStoredVoiceId(dialect, voiceId);
    setSelectedVoiceId(voiceId);
    appAlert('已保存', zh.me.voiceSaved);
  };

  const previewVoice = (voiceId: string) => {
    const sample =
      dialect === 'cantonese'
        ? zh.me.voicePreviewTextCantonese
        : zh.me.voicePreviewTextMandarin;
    void speakText(sample, undefined, {
      voiceId: voiceId ?? undefined,
      dialect,
    }).catch(() => {
      // speakText 内已弹窗提示
    });
  };

  const keysMenuStatus = zh.me.keysMenuStatus.replace('{count}', String(keysConfiguredCount));

  const selectArticleFont = async (preset: FontSizePreset) => {
    await setArticlePreset(preset);
    appAlert('已保存', zh.me.fontArticleSaved);
  };

  const selectDialogFont = async (preset: FontSizePreset) => {
    await setDialogPreset(preset);
    appAlert('已保存', zh.me.fontDialogSaved);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        isTablet && styles.contentTablet,
        {
          paddingTop: isTablet ? Math.max(insets.top, 12) : insets.top,
          paddingHorizontal: mePadX,
          maxWidth: width,
          width: '100%',
          alignSelf: 'center',
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <TabletFrame variant="settings" scrollChild>
        <Text style={[styles.title, isTablet && styles.titleTablet]}>{zh.me.title}</Text>

        <Pressable
          style={[styles.menuRow, isTablet && styles.menuRowTablet]}
          onPress={() => navigation.navigate('ApiKeys')}
          accessibilityRole="button"
        >
          <View style={styles.menuRowBody}>
            <Text style={[styles.menuRowTitle, { fontSize: buttonFontSize }]}>
              {zh.me.keysMenuTitle}
            </Text>
            <Text style={styles.menuRowSubtitle}>{keysMenuStatus}</Text>
          </View>
          <Text style={styles.menuChevron}>›</Text>
        </Pressable>

        <View style={[styles.card, isTablet && styles.cardBlockTablet]}>
          <FontSizePresetPicker
            title={zh.me.fontArticleTitle}
            sampleText={zh.me.fontArticleSample}
            value={articlePreset}
            onChange={(p) => void selectArticleFont(p)}
          />
          <FontSizePresetPicker
            title={zh.me.fontDialogTitle}
            sampleText={zh.me.fontDialogSample}
            value={dialogPreset}
            onChange={(p) => void selectDialogFont(p)}
          />
        </View>

        <View style={[styles.card, isTablet && styles.cardBlockTablet]}>
          <Text style={[styles.section, isTablet && styles.sectionTablet]}>{zh.me.dialectTitle}</Text>
          <View style={styles.dialectRow}>
            <Pressable
              style={[styles.dialectChip, dialect === 'mandarin' && styles.dialectChipActive]}
              onPress={() => void selectDialect('mandarin')}
            >
              <Text
                style={[
                  styles.dialectChipText,
                  { fontSize: captionFontSize },
                  dialect === 'mandarin' && styles.dialectChipTextActive,
                ]}
              >
                {zh.me.dialectMandarin}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.dialectChip, dialect === 'cantonese' && styles.dialectChipActive]}
              onPress={() => void selectDialect('cantonese')}
            >
              <Text
                style={[
                  styles.dialectChipText,
                  { fontSize: captionFontSize },
                  dialect === 'cantonese' && styles.dialectChipTextActive,
                ]}
              >
                {zh.me.dialectCantonese}
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.section, isTablet && styles.sectionTablet, styles.voiceSectionTitle]}>
            {zh.me.voiceTitle}
          </Text>
          {voices.map((v) => {
            const id = ttsVoiceOptionId(v);
            return (
              <View key={id} style={styles.voiceItem}>
                <Pressable
                  style={[styles.voiceRow, selectedVoiceId === id && styles.voiceRowActive]}
                  onPress={() => void selectVoice(id)}
                >
                  <Text style={[styles.voiceName, { fontSize: bodyFontSize }]}>
                    {ttsVoiceOptionLabel(v)}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.voicePreviewBtn}
                  onPress={() => void previewVoice(id)}
                >
                  <Text style={styles.voicePreviewText}>{zh.me.voicePreview}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </TabletFrame>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingBottom: 48 },
  contentTablet: { paddingBottom: 56 },
  title: {
    fontSize: typography.title,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 24,
  },
  titleTablet: { fontSize: 36, marginBottom: 28 },
  card: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  cardBlockTablet: { padding: 24, marginBottom: 28 },
  section: {
    fontSize: typography.button,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 14,
  },
  sectionTablet: { fontSize: typography.button, marginBottom: 16 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
    minHeight: 64,
  },
  menuRowTablet: { padding: 22, marginBottom: 28, minHeight: 72, borderRadius: 14 },
  menuRowBody: { flex: 1, marginRight: 12 },
  menuRowTitle: { fontWeight: '600', color: colors.text },
  menuRowSubtitle: {
    fontSize: typography.caption,
    color: colors.textMuted,
    marginTop: 8,
  },
  menuChevron: {
    fontSize: 28,
    color: colors.textMuted,
    fontWeight: '300',
  },
  dialectRow: { flexDirection: 'row', gap: 18, marginBottom: 24 },
  dialectChip: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  dialectChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  dialectChipText: { color: colors.textMuted, fontWeight: '600' },
  dialectChipTextActive: { color: colors.text },
  voiceSectionTitle: { marginTop: 8 },
  voiceItem: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  voiceRow: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    minHeight: 52,
    justifyContent: 'center',
  },
  voiceRowActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  voiceName: { color: colors.text },
  voicePreviewBtn: { paddingVertical: 14, paddingHorizontal: 12, minHeight: 52, justifyContent: 'center' },
  voicePreviewText: { fontSize: typography.caption, color: colors.primary, fontWeight: '600' },
});
