import { useMemo } from 'react';
import { Linking, Platform, ScrollView, Text, View } from 'react-native';
import Markdown, {
  MarkdownIt,
  type ASTNode,
  type RenderRules,
} from 'react-native-markdown-display';
import type { StyleProp, TextStyle } from 'react-native';
import { appAlert } from '../lib/appAlert';
import { MermaidBlock } from './MermaidBlock';
import type { FontChannel } from '../theme/fontPresets';
import { buildMessageMarkdownStyles } from '../theme/messageMarkdownStyles';
import { useTextStyles } from '../theme/useTextStyles';
import { useTypography } from '../theme/layout';
import { useColors } from '../theme/ThemeContext';

type Props = {
  content: string;
  /** 用户气泡可略小行距 */
  variant?: 'body' | 'reply';
  channel?: FontChannel;
  /** 纯文本兜底（无 markdown 时） */
  plainTextStyle?: StyleProp<TextStyle>;
};

type FenceNode = ASTNode & { sourceInfo?: string };

const markdownIt = MarkdownIt({ typographer: true, linkify: true }).enable([
  'table',
  'strikethrough',
]);

function fenceLanguage(node: FenceNode): string {
  const info = node.sourceInfo?.trim().toLowerCase() ?? '';
  return info.split(/\s+/)[0] ?? '';
}

function fenceContent(node: ASTNode): string {
  let text = node.content ?? '';
  if (text.endsWith('\n')) text = text.slice(0, -1);
  return text;
}

function CodeFenceBlock({
  language,
  code,
  inheritedStyles,
  fenceStyle,
}: {
  language: string;
  code: string;
  inheritedStyles: TextStyle;
  fenceStyle: TextStyle;
}) {
  const colors = useColors();
  const label = language ? language.toUpperCase() : 'CODE';

  return (
    <View style={{ marginVertical: 8 }}>
      {language ? (
        <Text
          style={{
            fontSize: Math.max((fenceStyle.fontSize as number) * 0.75, 16),
            color: colors.textMuted,
            marginBottom: 4,
            fontWeight: '600',
          }}
        >
          {label}
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'}>
        <Text style={[inheritedStyles, fenceStyle]} selectable>
          {code}
        </Text>
      </ScrollView>
    </View>
  );
}

export function MessageRichText({
  content,
  variant = 'reply',
  channel = 'dialog',
  plainTextStyle,
}: Props) {
  const colors = useColors();
  const textStyles = useTextStyles(channel);
  const { bodyFontSize, bodyLineHeight, replyLineHeight, captionFontSize } =
    useTypography(channel);
  const baseStyle = variant === 'body' ? textStyles.body : textStyles.reply;
  const contentLineHeight = variant === 'body' ? bodyLineHeight : replyLineHeight;

  const markdownStyles = useMemo(
    () =>
      buildMessageMarkdownStyles({
        colors,
        bodyFontSize,
        bodyLineHeight: contentLineHeight,
        captionFontSize,
        paragraphMarginBottom: variant === 'reply' ? 6 : 10,
      }),
    [colors, bodyFontSize, contentLineHeight, captionFontSize, variant],
  );

  const rules = useMemo<RenderRules>(
    () => ({
      fence: (node, _children, _parent, styles, inheritedStyles = {}) => {
        const fenceNode = node as FenceNode;
        const lang = fenceLanguage(fenceNode);
        const code = fenceContent(fenceNode);
        if (lang === 'mermaid') {
          return <MermaidBlock key={node.key} code={code} />;
        }
        return (
          <CodeFenceBlock
            key={node.key}
            language={lang}
            code={code}
            inheritedStyles={inheritedStyles as TextStyle}
            fenceStyle={styles.fence as TextStyle}
          />
        );
      },
    }),
    [],
  );

  const trimmed = content.trim();
  if (!trimmed) return null;

  const looksLikeMarkdown =
    /(^|\n)(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|`\S|`[^`]+`|\|.+\||\*\*|__|\[.+\]\(.+\))/m.test(
      trimmed,
    );

  if (!looksLikeMarkdown) {
    return <Text style={plainTextStyle ?? baseStyle}>{content}</Text>;
  }

  return (
    <Markdown
      style={markdownStyles}
      rules={rules}
      markdownit={markdownIt}
      mergeStyle
      onLinkPress={(url) => {
        void Linking.openURL(url).catch(() => {
          appAlert('链接打不开', url);
        });
        return false;
      }}
    >
      {content}
    </Markdown>
  );
}
