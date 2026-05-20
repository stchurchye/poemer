import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { copyTextToClipboard } from '../lib/copyToClipboard';
import { zh } from '../locales/zh-CN';

type Props = {
  children: ReactNode;
  textToCopy: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** 对话气泡：长按复制正文 */
export function CopyableMessageBubble({ children, textToCopy, disabled, style }: Props) {
  const canCopy = !disabled && textToCopy.trim().length > 0;

  return (
    <Pressable
      style={style}
      disabled={!canCopy}
      onLongPress={() => void copyTextToClipboard(textToCopy)}
      delayLongPress={400}
      accessibilityRole="text"
      accessibilityHint={canCopy ? zh.common.longPressToCopy : undefined}
    >
      {children}
    </Pressable>
  );
}
