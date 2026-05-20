import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { colors } from '../theme/colors';
import { radius } from '../theme/tokens';

type Props = {
  code: string;
};

function buildMermaidHtml(diagram: string): string {
  const payload = JSON.stringify(diagram.trim());
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<style>
  html, body { margin: 0; padding: 8px; background: transparent; overflow: hidden; }
  #wrap { display: flex; justify-content: center; align-items: flex-start; min-height: 40px; }
  svg { max-width: 100%; height: auto; }
  .err { color: #c62828; font: 14px/1.5 sans-serif; white-space: pre-wrap; }
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
      mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
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

export function MermaidBlock({ code }: Props) {
  const [height, setHeight] = useState(160);
  const [loading, setLoading] = useState(true);
  const html = useMemo(() => buildMermaidHtml(code), [code]);

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

const styles = StyleSheet.create({
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
