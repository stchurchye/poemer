import { StyleSheet } from 'react-native';
import { colors } from './colors';
import { radius } from './tokens';

/**
 * 对话气泡：小助手暖色底、用户消息浅橙底
 */
export const chatMessageStyles = StyleSheet.create({
  row: {
    width: '100%',
    flexShrink: 0,
    marginBottom: 20,
  },
  /** 小助手 / 问答回复（底色由整栏/浮层承担，此处不加气泡底） */
  assistant: {
    alignSelf: 'stretch',
    maxWidth: '100%',
    paddingHorizontal: 4,
    paddingVertical: 4,
    backgroundColor: 'transparent',
  },
  assistantTablet: {
    paddingHorizontal: 6,
  },
  /** 用户提问：轻底色、无边框 */
  user: {
    alignSelf: 'flex-end',
    maxWidth: '88%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  userTablet: {
    maxWidth: '72%',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  /** 写作助手：提示 / 待确认类消息，淡底无边框 */
  notice: {
    alignSelf: 'stretch',
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.waiting,
  },
  error: {
    alignSelf: 'stretch',
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.waiting,
  },
  text: {
    color: colors.text,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flexShrink: 0,
  },
});
