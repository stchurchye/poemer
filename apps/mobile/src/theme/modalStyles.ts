import { StyleSheet } from 'react-native';
import { colors } from './colors';
import { radius, shadow, touch } from './tokens';

/** 居中卡片弹窗、右侧浮层共用的样式片段 */
export const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.backdrop,
    justifyContent: 'center',
    padding: 20,
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.backdrop,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardCentered: {
    maxHeight: '92%',
    width: '100%',
  },
  /** 应用内 Alert / Prompt 提示框 */
  alertBackdrop: {
    flex: 1,
    backgroundColor: colors.backdrop,
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 12,
  },
  alertCard: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerBordered: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  title: {
    flex: 1,
    fontWeight: '700',
    color: colors.text,
  },
  closeBtn: {
    minWidth: touch.min,
    minHeight: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.md,
    borderBottomLeftRadius: radius.md,
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: shadow.color,
    shadowOffset: { width: -2, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
});
