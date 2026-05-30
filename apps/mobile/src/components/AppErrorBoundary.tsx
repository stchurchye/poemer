import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ColorPalette } from '../theme/colors';
import { typography } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

function createErrorFallbackStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 },
    title: { fontSize: typography.title, fontWeight: '700', color: colors.text },
    hint: { fontSize: typography.body, lineHeight: typography.bodyLineHeight, color: colors.text },
    detail: { fontSize: typography.caption, color: colors.textMuted },
    btn: {
      marginTop: 8,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    btnText: { color: colors.onPrimary, fontSize: typography.button, fontWeight: '600' },
  });
}

function ErrorFallback({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  const styles = useThemedStyles(createErrorFallbackStyles);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>界面出了点问题</Text>
        <Text style={styles.hint}>
          请完全退出 App 后重新打开；开发版可摇一摇设备打开开发菜单并点 Reload。
        </Text>
        <Text style={styles.detail}>{error.message}</Text>
        <Pressable style={styles.btn} onPress={onRetry}>
          <Text style={styles.btnText}>再试一次</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/** 捕获渲染期崩溃，避免整屏纯白 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[小作家] 界面异常', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
