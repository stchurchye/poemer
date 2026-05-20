import type { ReactNode, RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TextInput } from 'react-native';
import type { ContextUsage } from '@shiren/shared';
import { ChatComposeBar } from './ChatComposeBar';
import { zh } from '../locales/zh-CN';

type Props = {
  input: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onVoiceText: (text: string) => void;
  placeholder: string;
  sendLabel: string;
  disabled?: boolean;
  busy?: boolean;
  inputRef?: RefObject<TextInput | null>;
  topAccessory?: ReactNode;
  onPickImage?: () => void;
  onPickImagePress?: () => void;
  sendAlsoWhen?: boolean;
  /** 有值时用文字按钮替代相册图标（写作小助手「识别图片」） */
  imageActionLabel?: string;
  contextUsage?: ContextUsage | null;
  contextUsageLoading?: boolean;
  onContextDetailOpen?: (usage: ContextUsage) => void;
  onContextRingLongPress?: () => void;
  contextAfterTrailing?: boolean;
};

/** 写作/问答小助手底部输入：微信式 ChatComposeBar */
export function AssistantComposeDock({
  input,
  onChangeText,
  onSend,
  onVoiceText,
  placeholder,
  sendLabel,
  disabled,
  busy,
  inputRef,
  topAccessory,
  onPickImage,
  onPickImagePress,
  sendAlsoWhen,
  imageActionLabel,
  contextUsage,
  contextUsageLoading,
  onContextDetailOpen,
  onContextRingLongPress,
  contextAfterTrailing = false,
}: Props) {
  const showContextSlot =
    contextUsage !== undefined || contextUsageLoading;

  return (
    <View style={styles.footer}>
      {topAccessory}
      <ChatComposeBar
        inputRef={inputRef}
        value={input}
        onChangeText={onChangeText}
        onSend={onSend}
        onSendVoiceText={onVoiceText}
        onPickImage={onPickImage ? () => onPickImage() : undefined}
        onPickImagePress={onPickImagePress}
        sendAlsoWhen={sendAlsoWhen}
        imageActionLabel={imageActionLabel}
        placeholder={placeholder}
        sendLabel={sendLabel}
        disabled={disabled}
        busy={busy}
        bottomInset={0}
        reserveContextSlot={showContextSlot}
        contextUsage={contextUsage}
        contextUsageLoading={contextUsageLoading}
        onContextDetailOpen={onContextDetailOpen}
        onContextRingLongPress={onContextRingLongPress}
        contextAfterTrailing={contextAfterTrailing}
        fontChannel="article"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexShrink: 0,
    marginTop: 4,
    gap: 8,
  },
});
