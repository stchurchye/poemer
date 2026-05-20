import { appAlert } from './appAlert';
import { pickChatImagesFromSource } from './pickChatImage';
import { zh } from '../locales/zh-CN';

export type PickedOcrImage = {
  uri: string;
  base64?: string | null;
  mimeType?: string | null;
};

/** 在关闭小助手弹窗后调用，避免 iPad 上系统相册嵌套 Modal 无法确认/关闭 */
export function promptAssistantOcrImages(
  onChoice: (source: 'camera' | 'library') => void,
): void {
  appAlert(zh.writing.ocrPickTitle, zh.writing.ocrPickMessage, [
    { text: zh.writing.ocrPickCamera, onPress: () => onChoice('camera') },
    { text: zh.writing.ocrPickLibrary, onPress: () => onChoice('library') },
    { text: zh.writing.cancel, style: 'cancel' },
  ]);
}

export async function pickAssistantOcrImagesFromSource(
  source: 'camera' | 'library',
): Promise<PickedOcrImage[]> {
  const picked = await pickChatImagesFromSource(source);
  return picked.map(({ uri, base64, mimeType }) => ({
    uri,
    base64,
    mimeType,
  }));
}
