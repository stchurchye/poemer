import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  canManualOtaUpdate,
  getAppVersionFooterLabel,
  getAppVersionInfo,
} from '../lib/appVersionInfo';
import { runManualOtaUpdate, type OtaManualPhase } from '../lib/otaUpdate';
import { colors, typography } from '../theme/colors';
import { zh } from '../locales/zh-CN';

function phaseButtonLabel(phase: OtaManualPhase): string {
  if (phase === 'checking') return zh.me.otaChecking;
  if (phase === 'downloading') return zh.me.otaDownloading;
  return zh.me.otaCheckUpdate;
}

export function AppVersionFooter() {
  const [label, setLabel] = useState(() => getAppVersionFooterLabel(getAppVersionInfo()));
  const [canUpdate, setCanUpdate] = useState(() => canManualOtaUpdate(getAppVersionInfo()));
  const [phase, setPhase] = useState<OtaManualPhase>('idle');
  const busy = phase !== 'idle';

  useFocusEffect(
    useCallback(() => {
      const info = getAppVersionInfo();
      setLabel(getAppVersionFooterLabel(info));
      setCanUpdate(canManualOtaUpdate(info));
    }, []),
  );

  const onCheckUpdate = useCallback(() => {
    if (busy) return;
    void runManualOtaUpdate(setPhase);
  }, [busy]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {canUpdate ? (
        <Pressable
          style={[styles.btn, busy && styles.btnBusy]}
          onPress={onCheckUpdate}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={phaseButtonLabel(phase)}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.primary} style={styles.spinner} />
          ) : null}
          <Text style={[styles.btnText, busy && styles.btnTextBusy]}>
            {phaseButtonLabel(phase)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    paddingTop: 20,
    paddingBottom: 8,
    alignItems: 'center',
    gap: 12,
  },
  label: {
    fontSize: typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: Math.round(typography.small * 1.45),
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    minWidth: 160,
  },
  btnBusy: {
    opacity: 0.85,
  },
  spinner: {
    marginRight: 8,
  },
  btnText: {
    fontSize: typography.caption,
    fontWeight: '600',
    color: colors.primary,
  },
  btnTextBusy: {
    color: colors.textMuted,
  },
});
