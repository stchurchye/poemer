import * as Clipboard from 'expo-clipboard';
import { appAlert } from './appAlert';
import { zh } from '../locales/zh-CN';

/** 复制到系统剪贴板并提示用户 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;
  try {
    await Clipboard.setStringAsync(trimmed);
    appAlert(zh.common.copyDone);
    return true;
  } catch {
    appAlert(zh.common.copyFailed);
    return false;
  }
}
