import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from 'react-native';
import type { RefObject } from 'react';
import type { ContextUsage } from '@shiren/shared';
import { AppTextInput } from './AppTextInput';
import { ContextUsageControl } from './ContextUsageControl';
import { ChatUiIcon } from './ChatUiIcon';
import { useHoldToSpeak } from '../hooks/useHoldToSpeak';
import { ensureSpeechPermissions } from '../lib/speech/localRecognition';
import { pickChatImagesFromSource } from '../lib/pickChatImage';
import { appAlert } from '../lib/appAlert';
import { colors } from '../theme/colors';
import { radius } from '../theme/tokens';
import type { FontChannel } from '../theme/fontPresets';
import { useLayout, useTypography } from '../theme/layout';
import { zh } from '../locales/zh-CN';
import { composeBarIcons } from '../assets/chatIcons';

export type ComposeMode = 'keyboard' | 'voice';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onSendVoiceText?: (text: string) => void;
  onPickImage?: (asset: { uri: string; base64?: string | null; mimeType?: string | null }) => void;
  /** 由父级完全接管选图（如问答：拍照/相册多选） */
  onPickImagePress?: () => void;
  /** 除输入文字外也可发送（如已选图片） */
  sendAlsoWhen?: boolean;
  /** 有值时用文字按钮替代右侧相册图标 */
  imageActionLabel?: string;
  placeholder?: string;
  busy?: boolean;
  disabled?: boolean;
  inputRef?: RefObject<TextInput | null>;
  contextUsage?: ContextUsage | null;
  contextUsageLoading?: boolean;
  bottomInset?: number;
  reserveContextSlot?: boolean;
  onContextDetailOpen?: (usage: ContextUsage) => void;
  onContextRingLongPress?: () => void;
  contextAfterTrailing?: boolean;
  sendLabel?: string;
  /** 文章档：写作小助手输入；默认对话档 */
  fontChannel?: FontChannel;
};

export function ChatComposeBar({
  value,
  onChangeText,
  onSend,
  onSendVoiceText,
  onPickImage,
  onPickImagePress,
  sendAlsoWhen,
  imageActionLabel,
  placeholder = zh.chat.placeholder,
  busy,
  disabled,
  inputRef,
  contextUsage,
  contextUsageLoading,
  bottomInset,
  reserveContextSlot,
  onContextDetailOpen,
  onContextRingLongPress,
  contextAfterTrailing,
  sendLabel,
  fontChannel = 'dialog',
}: Props) {
  const icons = useMemo(() => composeBarIcons('human'), []);
  const { isTablet } = useLayout();
  const { captionFontSize, buttonFontSize, smallFontSize } = useTypography(fontChannel);
  const isWritingDock = Boolean(imageActionLabel);
  const composeFontSize = captionFontSize;
  const composeLineHeight = captionFontSize;
  const holdFontSize = isWritingDock ? smallFontSize : composeFontSize;
  const holdLineHeight = Math.round(holdFontSize * 1.2);
  const iconSize = isWritingDock ? (isTablet ? 46 : 44) : isTablet ? 42 : 40;
  const modeBtnWidth = isWritingDock ? (isTablet ? 64 : 60) : isTablet ? 56 : 52;
  const fieldHeight = isTablet ? 60 : 56;
  const bottomPad = bottomInset ?? 8;
  const showContextSlot =
    reserveContextSlot || contextUsage !== undefined || contextUsageLoading;
  /** 默认语音模式，点左侧图标切到键盘输入 */
  const [mode, setMode] = useState<ComposeMode>('voice');

  useEffect(() => {
    void ensureSpeechPermissions();
  }, []);

  const { holding, transcribing, onPressIn, onPressOut } = useHoldToSpeak(
    useCallback(
      (text) => {
        if (onSendVoiceText) {
          onSendVoiceText(text);
        } else {
          onChangeText(text);
          onSend();
        }
      },
      [onChangeText, onSend, onSendVoiceText],
    ),
  );

  const canSend = (Boolean(value.trim()) || Boolean(sendAlsoWhen)) && !busy && !disabled;
  const useKeyboardSend = mode === 'keyboard';

  const handleKeyboardSend = useCallback(() => {
    if (canSend) onSend();
  }, [canSend, onSend]);

  const contextControl = showContextSlot ? (
    <ContextUsageControl
      usage={contextUsage ?? null}
      loading={contextUsageLoading}
      reserveSlot={reserveContextSlot}
      onOpenDetail={onContextDetailOpen}
      onRingLongPress={onContextRingLongPress}
    />
  ) : null;

  const switchToVoice = useCallback(async () => {
    const ok = await ensureSpeechPermissions();
    if (!ok) {
      appAlert('需要权限', zh.chat.speechPermissionHint, [
        { text: '去设置', onPress: () => void Linking.openSettings() },
        { text: '知道了', style: 'cancel' },
      ]);
      return;
    }
    setMode('voice');
  }, []);

  const switchToKeyboard = useCallback(() => {
    setMode('keyboard');
    setTimeout(() => inputRef?.current?.focus(), 80);
  }, [inputRef]);

  const handleToggleMode = useCallback(() => {
    if (mode === 'voice') {
      switchToKeyboard();
    } else {
      void switchToVoice();
    }
  }, [mode, switchToKeyboard, switchToVoice]);

  const handlePickImage = useCallback(async () => {
    if (onPickImagePress) {
      onPickImagePress();
      return;
    }
    const picked = await pickChatImagesFromSource('library', { remainingSlots: 1 });
    const asset = picked[0];
    if (asset && onPickImage) {
      onPickImage({
        uri: asset.uri,
        base64: asset.base64,
        mimeType: asset.mimeType,
      });
    }
  }, [onPickImage, onPickImagePress]);

  return (
    <View style={styles.barOuter}>
      <View style={[styles.bar, { paddingBottom: bottomPad }]}>
        <Pressable
          style={[styles.iconBtn, { width: modeBtnWidth, height: fieldHeight }]}
          onPress={handleToggleMode}
          disabled={busy || disabled}
          accessibilityRole="button"
          accessibilityLabel={mode === 'voice' ? zh.chat.switchToKeyboard : zh.chat.switchToVoice}
        >
          <ChatUiIcon
            source={mode === 'voice' ? icons.keyboard : icons.voice}
            size={iconSize}
          />
        </Pressable>

        <View style={[styles.center, { minHeight: fieldHeight }]}>
          <View style={[styles.fieldShell, { minHeight: fieldHeight }]}>
            {mode === 'keyboard' ? (
              <AppTextInput
                ref={inputRef}
                variant="compose"
                containerStyle={styles.inputWrap}
                style={{
                  fontSize: composeFontSize,
                  lineHeight: composeLineHeight,
                  color: colors.text,
                }}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                value={value}
                onChangeText={onChangeText}
                multiline
                scrollEnabled
                editable={!disabled && !busy}
                returnKeyType={useKeyboardSend ? 'send' : 'default'}
                submitBehavior={useKeyboardSend ? 'submit' : 'newline'}
                enablesReturnKeyAutomatically={useKeyboardSend}
                blurOnSubmit={false}
                onSubmitEditing={useKeyboardSend ? handleKeyboardSend : undefined}
              />
            ) : (
              <Pressable
                style={[styles.holdArea, { minHeight: fieldHeight }, holding && styles.holdAreaActive]}
                onPressIn={() => void onPressIn()}
                onPressOut={onPressOut}
                disabled={busy || disabled}
              >
                <Text
                  style={[
                    styles.holdLabel,
                    isWritingDock
                      ? { fontSize: holdFontSize, lineHeight: holdLineHeight }
                      : { fontSize: composeFontSize, lineHeight: composeLineHeight },
                    holding && styles.holdLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {transcribing
                    ? zh.writing.transcribingVoice
                    : holding
                      ? zh.writing.releaseToFinish
                      : zh.writing.speak}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {!contextAfterTrailing ? contextControl : null}

        {(() => {
          const showSend = canSend && (mode === 'keyboard' || sendAlsoWhen);
          const showImageAction =
            Boolean(imageActionLabel) && Boolean(onPickImage || onPickImagePress);
          const showPlus = !showSend && !showImageAction && Boolean(onPickImage || onPickImagePress);

          return (
            <>
              {showSend ? (
                <Pressable
                  style={[styles.sendBtn, { height: fieldHeight, minWidth: isTablet ? 72 : 64 }]}
                  onPress={onSend}
                  disabled={!canSend}
                  accessibilityRole="button"
                  accessibilityLabel={sendLabel ?? zh.chat.send}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.onPrimary} size="small" />
                  ) : (
                    <Text style={[styles.sendBtnText, { fontSize: buttonFontSize }]}>
                      {sendLabel ?? zh.chat.send}
                    </Text>
                  )}
                </Pressable>
              ) : null}
              {showImageAction ? (
                <Pressable
                  style={[styles.imageTextBtn, styles.imageTextBtnDock, { height: fieldHeight }]}
                  onPress={() => void handlePickImage()}
                  disabled={busy || disabled}
                  accessibilityRole="button"
                  accessibilityLabel={imageActionLabel}
                >
                  <Text
                    style={[styles.imageTextBtnLabel, { fontSize: smallFontSize }]}
                    numberOfLines={1}
                  >
                    {imageActionLabel}
                  </Text>
                </Pressable>
              ) : showPlus ? (
                <Pressable
                  style={[styles.iconBtn, { width: modeBtnWidth, height: fieldHeight }]}
                  onPress={() => void handlePickImage()}
                  disabled={busy || disabled}
                  accessibilityRole="button"
                  accessibilityLabel={zh.chat.pickImage}
                >
                  <ChatUiIcon source={icons.plus} size={iconSize} active={!busy && !disabled} />
                </Pressable>
              ) : null}
            </>
          );
        })()}

        {contextAfterTrailing ? contextControl : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barOuter: {
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: radius.md,
    marginHorizontal: 4,
    marginTop: 2,
    overflow: 'hidden',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  fieldShell: {
    flex: 1,
    minWidth: 0,
    maxHeight: 140,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  inputWrap: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  holdArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    minWidth: 0,
  },
  holdAreaActive: {
    backgroundColor: colors.primarySoft,
  },
  holdLabel: {
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  holdLabelActive: {
    color: colors.primary,
  },
  sendBtn: {
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
  imageTextBtn: {
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
    maxWidth: 120,
  },
  imageTextBtnDock: {
    flexShrink: 0,
    paddingHorizontal: 10,
    minWidth: 96,
    maxWidth: undefined,
  },
  imageTextBtnLabel: {
    color: colors.primary,
    fontWeight: '600',
  },
});
