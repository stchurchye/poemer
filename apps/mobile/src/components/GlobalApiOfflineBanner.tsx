import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApiConnectivityOptional } from '../context/ApiConnectivityContext';
import type { ColorPalette } from '../theme/colors';
import { typography } from '../theme/colors';
import { zh } from '../locales/zh-CN';
import { useColors } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';

function createGlobalApiOfflineBannerStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginHorizontal: 12,
      marginTop: 8,
      marginBottom: 4,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: colors.waiting,
      borderWidth: 1,
      borderColor: colors.border,
    },
    textCol: { flex: 1, gap: 6 },
    title: { fontSize: typography.body, fontWeight: '600', color: colors.text },
    hint: {
      fontSize: typography.caption,
      color: colors.textMuted,
      lineHeight: typography.bodyLineHeight,
    },
    btn: {
      minWidth: 88,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnDisabled: { opacity: 0.7 },
    btnText: { color: colors.onPrimary, fontWeight: '600', fontSize: typography.caption },
  });
}

/** 全局：服务器不可达时显示在 Tab 内容顶部 */
export function GlobalApiOfflineBanner() {
  const colors = useColors();
  const styles = useThemedStyles(createGlobalApiOfflineBannerStyles);
  const ctx = useApiConnectivityOptional();
  if (!ctx) return null;

  const { reachable, checking, suppressGlobalBanner, bannerMessage, bannerHint, triggerReconnect } =
    ctx;
  if (reachable === true || suppressGlobalBanner) return null;
  if (reachable !== false) return null;

  return (
    <View style={styles.root}>
      <View style={styles.textCol}>
        <Text style={styles.title}>
          {checking ? zh.network.checking : bannerMessage || zh.network.disconnected}
        </Text>
        {bannerHint ? (
          <Text style={styles.hint} selectable>
            {bannerHint}
          </Text>
        ) : null}
      </View>
      <Pressable
        style={[styles.btn, checking && styles.btnDisabled]}
        onPress={() => void triggerReconnect()}
        disabled={checking}
        hitSlop={8}
      >
        {checking ? (
          <ActivityIndicator size="small" color={colors.onPrimary} />
        ) : (
          <Text style={styles.btnText}>{zh.network.reconnectAction}</Text>
        )}
      </Pressable>
    </View>
  );
}
