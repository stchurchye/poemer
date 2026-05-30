import { useCallback, useEffect, useRef, useState } from 'react';
import type { ColorPalette } from '../theme/colors';
import { typography } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTextInput } from '../components/AppTextInput';
import { TabletFrame } from '../components/TabletFrame';
import { appAlert } from '../lib/appAlert';
import { api } from '../lib/api';
import { apiErrorText } from '../lib/apiError';
import { getDeepSeekApiKey, maskApiKey, setDeepSeekApiKey } from '../lib/deepseekKey';
import { getDashScopeApiKey, maskDashScopeApiKey, setDashScopeApiKey } from '../lib/dashscopeKey';
import { getZenMuxApiKey, maskZenMuxApiKey, setZenMuxApiKey } from '../lib/zenmuxKey';
import { useLayout } from '../theme/layout';
import { zh } from '../locales/zh-CN';

type KeyInputRowProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  isTablet: boolean;
  bodyFontSize: number;
  inputStyle?: StyleProp<TextStyle>;
  onFocus?: () => void;
};

function KeyInputRow({
  value,
  onChangeText,
  placeholder,
  isTablet,
  bodyFontSize,
  inputStyle,
  onFocus,
}: KeyInputRowProps) {
  const styles = useThemedStyles(createApiKeysScreenStyles);
  const colors = useColors();
  return (
    <AppTextInput
      style={[
        styles.input,
        isTablet && styles.inputTablet,
        { fontSize: bodyFontSize },
        inputStyle,
      ]}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      value={value}
      onChangeText={onChangeText}
      autoCapitalize="none"
      autoCorrect={false}
      secureTextEntry
      textContentType="password"
      onFocus={onFocus}
    />
  );
}

export function ApiKeysScreen() {
  const colors = useColors();
  const styles = useThemedStyles(createApiKeysScreenStyles);

  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { isTablet, bodyFontSize, width } = useLayout();
  const padX = isTablet ? 20 : 12;
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsetsRef = useRef({ deepseek: 0, zenmux: 0, dashscope: 0 });
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [keyInput, setKeyInput] = useState('');
  const [keyMasked, setKeyMasked] = useState<string | null>(null);
  const [serverConfigured, setServerConfigured] = useState(false);
  const [zenmuxInput, setZenmuxInput] = useState('');
  const [zenmuxMasked, setZenmuxMasked] = useState<string | null>(null);
  const [zenmuxServerConfigured, setZenmuxServerConfigured] = useState(false);
  const [zenmuxSaving, setZenmuxSaving] = useState(false);
  const [dashscopeInput, setDashscopeInput] = useState('');
  const [dashscopeMasked, setDashscopeMasked] = useState<string | null>(null);
  const [dashscopeServerConfigured, setDashscopeServerConfigured] = useState(false);
  const [dashscopeSaving, setDashscopeSaving] = useState(false);
  const [saving, setSaving] = useState(false);

  const scrollToSection = useCallback((section: keyof typeof sectionOffsetsRef.current) => {
    const y = sectionOffsetsRef.current[section];
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardInset(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardInset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const loadKeyStatus = useCallback(async () => {
    const local = await getDeepSeekApiKey();
    setKeyMasked(local ? maskApiKey(local) : null);
    try {
      const status = await api.getDeepSeekStatus();
      setServerConfigured(status.data.configured);
    } catch {
      setServerConfigured(Boolean(local));
    }
  }, []);

  const loadZenmuxStatus = useCallback(async () => {
    const local = await getZenMuxApiKey();
    setZenmuxMasked(local ? maskZenMuxApiKey(local) : null);
    try {
      const status = await api.getZenMuxStatus();
      setZenmuxServerConfigured(status.data.configured);
    } catch {
      setZenmuxServerConfigured(Boolean(local));
    }
  }, []);

  const loadDashscopeStatus = useCallback(async () => {
    const local = await getDashScopeApiKey();
    setDashscopeMasked(local ? maskDashScopeApiKey(local) : null);
    try {
      const status = await api.getDashScopeStatus();
      setDashscopeServerConfigured(status.data.configured);
    } catch {
      setDashscopeServerConfigured(Boolean(local));
    }
  }, []);

  useEffect(() => {
    void loadKeyStatus();
    void loadZenmuxStatus();
    void loadDashscopeStatus();
  }, [loadKeyStatus, loadZenmuxStatus, loadDashscopeStatus]);

  const saveKey = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) {
      appAlert('请先填入密钥', zh.me.keySaveEmpty);
      return;
    }
    setSaving(true);
    try {
      await api.verifyDeepSeekKey(trimmed);
      await setDeepSeekApiKey(trimmed);
      setKeyInput('');
      setKeyMasked(maskApiKey(trimmed));
      appAlert('已保存', zh.me.deepseekSaveOk);
      await loadKeyStatus();
    } catch (e) {
      const { message, hint } = apiErrorText(e);
      appAlert(zh.me.deepseekVerifyFail, [message, hint].filter(Boolean).join('\n'));
    } finally {
      setSaving(false);
    }
  };

  const saveZenmuxKey = async () => {
    const trimmed = zenmuxInput.trim();
    if (!trimmed) {
      appAlert('请先填入密钥', zh.me.keySaveEmpty);
      return;
    }
    setZenmuxSaving(true);
    try {
      await api.verifyZenMuxKey(trimmed);
      await setZenMuxApiKey(trimmed);
      setZenmuxInput('');
      setZenmuxMasked(maskZenMuxApiKey(trimmed));
      appAlert('已保存', zh.me.zenmuxSaveOk);
      await loadZenmuxStatus();
    } catch (e) {
      const { message, hint } = apiErrorText(e);
      appAlert(zh.me.zenmuxVerifyFail, [message, hint].filter(Boolean).join('\n'));
    } finally {
      setZenmuxSaving(false);
    }
  };

  const saveDashscopeKey = async () => {
    const trimmed = dashscopeInput.trim();
    if (!trimmed) {
      appAlert('请先填入密钥', zh.me.keySaveEmpty);
      return;
    }
    setDashscopeSaving(true);
    try {
      await api.verifyDashScopeKey(trimmed);
      await setDashScopeApiKey(trimmed);
      setDashscopeInput('');
      setDashscopeMasked(maskDashScopeApiKey(trimmed));
      appAlert('已保存', zh.me.dashscopeSaveOk);
      await loadDashscopeStatus();
    } catch (e) {
      const { message, hint } = apiErrorText(e);
      appAlert(zh.me.dashscopeVerifyFail, [message, hint].filter(Boolean).join('\n'));
    } finally {
      setDashscopeSaving(false);
    }
  };

  const configured = serverConfigured || Boolean(keyMasked);
  const zenmuxConfigured = zenmuxServerConfigured || Boolean(zenmuxMasked);
  const dashscopeConfigured = dashscopeServerConfigured || Boolean(dashscopeMasked);

  const bottomPad = Math.max(insets.bottom, 24) + keyboardInset + 24;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          isTablet && styles.contentTablet,
          {
            paddingTop: isTablet ? 12 : 8,
            paddingHorizontal: padX,
            maxWidth: width,
            width: '100%',
            alignSelf: 'center',
            paddingBottom: bottomPad,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <TabletFrame variant="settings" scrollChild>
          <View
            style={[styles.card, isTablet && styles.cardBlockTablet]}
            onLayout={(e) => {
              sectionOffsetsRef.current.deepseek = e.nativeEvent.layout.y;
            }}
          >
            <Text style={[styles.section, isTablet && styles.sectionTablet]}>
              {zh.me.deepseekTitle}
            </Text>
            <Text style={styles.status}>
              {configured
                ? `● ${zh.me.deepseekConfigured}（${keyMasked ?? '服务端'}）`
                : `○ ${zh.me.deepseekNotConfigured}`}
            </Text>
            <KeyInputRow
              value={keyInput}
              onChangeText={setKeyInput}
              placeholder={zh.me.deepseekPlaceholder}
              isTablet={isTablet}
              bodyFontSize={bodyFontSize}
              onFocus={() => scrollToSection('deepseek')}
            />
            <Pressable
              style={[styles.keyBtn, styles.keyBtnPrimary, isTablet && styles.keyBtnTablet]}
              onPress={() => void saveKey()}
              disabled={saving || !keyInput.trim()}
            >
              {saving ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={[styles.keyBtnTextPrimary, isTablet && styles.keyBtnTextTablet]}>
                  {zh.me.deepseekSave}
                </Text>
              )}
            </Pressable>
          </View>

          <View
            style={[styles.card, isTablet && styles.cardBlockTablet]}
            onLayout={(e) => {
              sectionOffsetsRef.current.zenmux = e.nativeEvent.layout.y;
            }}
          >
            <Text style={[styles.section, isTablet && styles.sectionTablet]}>{zh.me.zenmuxTitle}</Text>
            <Text style={styles.status}>
              {zenmuxConfigured
                ? `● ${zh.me.zenmuxConfigured}（${zenmuxMasked ?? '服务端'}）`
                : `○ ${zh.me.zenmuxNotConfigured}`}
            </Text>
            <KeyInputRow
              value={zenmuxInput}
              onChangeText={setZenmuxInput}
              placeholder={zh.me.zenmuxPlaceholder}
              isTablet={isTablet}
              bodyFontSize={bodyFontSize}
              onFocus={() => scrollToSection('zenmux')}
            />
            <Pressable
              style={[styles.keyBtn, styles.keyBtnPrimary, isTablet && styles.keyBtnTablet]}
              onPress={() => void saveZenmuxKey()}
              disabled={zenmuxSaving || !zenmuxInput.trim()}
            >
              {zenmuxSaving ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={[styles.keyBtnTextPrimary, isTablet && styles.keyBtnTextTablet]}>
                  {zh.me.zenmuxSave}
                </Text>
              )}
            </Pressable>
          </View>

          <View
            style={[styles.card, isTablet && styles.cardBlockTablet]}
            onLayout={(e) => {
              sectionOffsetsRef.current.dashscope = e.nativeEvent.layout.y;
            }}
          >
            <Text style={[styles.section, isTablet && styles.sectionTablet]}>
              {zh.me.dashscopeTitle}
            </Text>
            <Text style={styles.status}>
              {dashscopeConfigured
                ? `● ${zh.me.dashscopeConfigured}（${dashscopeMasked ?? '服务端'}）`
                : `○ ${zh.me.dashscopeNotConfigured}`}
            </Text>
            <KeyInputRow
              value={dashscopeInput}
              onChangeText={setDashscopeInput}
              placeholder={zh.me.dashscopePlaceholder}
              isTablet={isTablet}
              bodyFontSize={bodyFontSize}
              onFocus={() => scrollToSection('dashscope')}
            />
            <Pressable
              style={[styles.keyBtn, styles.keyBtnPrimary, isTablet && styles.keyBtnTablet]}
              onPress={() => void saveDashscopeKey()}
              disabled={dashscopeSaving || !dashscopeInput.trim()}
            >
              {dashscopeSaving ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={[styles.keyBtnTextPrimary, isTablet && styles.keyBtnTextTablet]}>
                  {zh.me.dashscopeSave}
                </Text>
              )}
            </Pressable>
          </View>
        </TabletFrame>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createApiKeysScreenStyles(colors: ColorPalette) {
  return StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingBottom: 40 },
  contentTablet: { paddingBottom: 48 },
  card: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  cardBlockTablet: { padding: 20, marginBottom: 24 },
  section: {
    fontSize: typography.button,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  sectionTablet: { fontSize: typography.button, marginBottom: 10 },
  status: { fontSize: typography.caption, color: colors.primary, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: typography.body,
    backgroundColor: colors.background,
    color: colors.text,
    marginBottom: 12,
  },
  inputTablet: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  keyBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    minHeight: 44,
    justifyContent: 'center',
  },
  keyBtnTablet: { minHeight: 52, borderRadius: 12 },
  keyBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  keyBtnTextTablet: { fontSize: typography.button },
  keyBtnTextPrimary: { color: colors.onPrimary, fontSize: typography.caption, fontWeight: '600' },
});
}
