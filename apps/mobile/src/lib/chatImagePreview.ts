import * as FileSystem from 'expo-file-system/legacy';
import type { PickedChatImage } from './pickChatImage';

const ROOT = FileSystem.documentDirectory ?? '';

/** 将本轮选图复制到应用文档目录，供气泡长期展示（不进 LLM 上下文） */
export async function persistChatImagePreviews(
  sessionId: string,
  messageId: string,
  images: PickedChatImage[],
): Promise<string[]> {
  if (images.length === 0) return [];
  const dir = `${ROOT}chat-images/${sessionId}/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  const uris: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const src = images[i]!;
    const ext =
      src.mimeType?.includes('png') ? 'png' : src.mimeType?.includes('webp') ? 'webp' : 'jpg';
    const dest = `${dir}${messageId}-${i}.${ext}`;
    await FileSystem.copyAsync({ from: src.uri, to: dest });
    uris.push(dest);
  }
  return uris;
}
