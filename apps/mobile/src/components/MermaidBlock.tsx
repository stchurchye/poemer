import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ColorPalette } from '../theme/colors';
import { radius } from '../theme/tokens';
import { useColors, useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';

type Props = {
  code: string;
};

function buildMermaidHtml(diagram: string, theme: 'neutral' | 'dark', errorColor: string): string {
  const payload = JSON.stringify(diagram.trim());
  const errColor = JSON.stringify(errorColor);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<style>
  html, body { margin: 0; padding: 8px; background: transparent; overflow: hidden; }
  #wrap { display: flex; justify-content: center; align-items: flex-start; min-height: 40px; }
  svg { max-width: 100%; height: auto; }
  .err { color: ${errColor}; font: 14px/1.5 sans-serif; white-space: pre-wrap; }
</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
</head>
<body>
<div id="wrap"></div>
<script>
  (async function () {
    const diagram = ${payload};
    const wrap = document.getElementById('wrap');
    function postHeight() {
      const h = Math.max(document.body.scrollHeight, wrap.scrollHeight || 0);
      window.ReactNativeWebView.postMessage(String(h));
    }
    try {
      mermaid.initialize({ startOnLoad: false, theme: '${theme}', securityLevel: 'strict' });
      const id = 'm' + Date.now();
      const { svg } = await mermaid.render(id, diagram);
      wrap.innerHTML = svg;
      postHeight();
      setTimeout(postHeight, 120);
    } catch (e) {
      wrap.innerHTML = '<div class="err">' + String(e && e.message ? e.message : e) + '</div>';
      postHeight();
    }
  })();
</script>
</body>
</html>`;
}

function createMermaidBlockStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      marginVertical: 8,
      borderRadius: radius.sm,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    webview: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    loader: {
      position: 'absolute',
      alignSelf: 'center',
      top: '40%',
      zIndex: 1,
    },
  });
}

export function MermaidBlock({ code }: Props) {
  const colors = useColors();
  const { appearance } = useTheme();
  const styles = useThemedStyles(createMermaidBlockStyles);
  const [height, setHeight] = useState(160);
  const [loading, setLoading] = useState(true);
  const mermaidTheme = appearance === 'dark' ? 'dark' : 'neutral';
  const html = useMemo(
    () => buildMermaidHtml(code, mermaidTheme, colors.error),
    [code, mermaidTheme, colors.error],
  );

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    const next = Number.parseInt(event.nativeEvent.data, 10);
    if (Number.isFinite(next) && next > 0) {
      setHeight(Math.min(Math.max(next + 16, 80), 480));
    }
    setLoading(false);
  }, []);

  return (
    <View style={[styles.wrap, { height }]}>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} size="small" />
      ) : null}
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        style={styles.webview}
        onMessage={onMessage}
        onLoadEnd={() => setLoading(false)}
        javaScriptEnabled
        nestedScrollEnabled={false}
      />
    </View>
  );
}
