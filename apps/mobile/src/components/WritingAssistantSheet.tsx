import type { ReactNode } from 'react';
import type { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useModalStyles } from '../theme/modalStyles';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderChipButton } from './HeaderChipButton';
import { useTextStyles } from '../theme/useTextStyles';
import { HeaderContextMeter } from './HeaderContextMeter';
import { zh } from '../locales/zh-CN';

export type AssistantHeaderReadAloud = {
  speaking: boolean;
  canRead: boolean;
  onToggle: () => void;
};

export type AssistantHeaderContext = {
  ratio: number;
  loading?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
};

type Props = {
  visible: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  headerReadAloud?: AssistantHeaderReadAloud | null;
  headerContext?: AssistantHeaderContext | null;
};

/** 右侧浮层：Modal 承载，避免挡住主输入框键盘 */
export function WritingAssistantSheet({
  visible,
  title,
  closeLabel,
  onClose,
  children,
  headerReadAloud,
  headerContext,
}: Props) {
  const styles = useThemedStyles(createWritingAssistantSheetStyles);
  const modalStyles = useModalStyles();

  const { width, height } = useWindowDimensions();
  const text = useTextStyles('dialog');
  const insets = useSafeAreaInsets();

  const sheetWidth = Math.min(
    Math.round(width * 0.46 * 1.3 * 1.3 * 1.2),
    Math.round(width * 0.92),
  );
  const sheetHeight = Math.round(height - insets.top - insets.bottom - 8);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalRoot}>
        <Pressable
          style={modalStyles.backdropFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[
            styles.sheetWrap,
            {
              width: sheetWidth,
              height: sheetHeight,
              top: insets.top + 4,
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={[modalStyles.sheet, styles.sheetWarm]}>
            <View style={[modalStyles.headerBordered, styles.headerWarm]}>
              <View style={styles.headerTitleRow}>
                <Text style={[modalStyles.title, text.button, styles.headerTitle]} numberOfLines={1}>
                  {title}
                </Text>
                {headerContext ? (
                  <HeaderContextMeter
                    ratio={headerContext.ratio}
                    loading={headerContext.loading}
                    onPress={headerContext.onPress}
                    onLongPress={headerContext.onLongPress}
                  />
                ) : null}
              </View>
              <View style={styles.headerActions}>
                {headerReadAloud ? (
                  <HeaderChipButton
                    label={
                      headerReadAloud.speaking ? zh.writing.stopReading : zh.writing.readMode
                    }
                    onPress={headerReadAloud.onToggle}
                    active={headerReadAloud.speaking}
                    disabled={!headerReadAloud.canRead && !headerReadAloud.speaking}
                    accessibilityLabel={
                      headerReadAloud.speaking ? zh.writing.stopReading : zh.writing.readMode
                    }
                  />
                ) : null}
                <Pressable
                  onPress={onClose}
                  hitSlop={12}
                  style={modalStyles.closeBtn}
                  accessibilityRole="button"
                  accessibilityLabel={closeLabel}
                >
                  <Text style={[modalStyles.closeText, text.caption]}>✕</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.body}>{children}</View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function createWritingAssistantSheetStyles(colors: ColorPalette) {
  return StyleSheet.create({
  sheetWarm: {
    backgroundColor: colors.assistantBg,
    borderColor: colors.border,
  },
  headerWarm: {
    backgroundColor: colors.assistantBg,
    borderBottomColor: colors.border,
  },
  modalRoot: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    position: 'absolute',
    right: 0,
    zIndex: 2,
  },
  body: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: colors.assistantBg,
  },
  headerTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: 0,
    marginRight: 8,
  },
  headerTitle: {
    flex: 0,
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
});
}
