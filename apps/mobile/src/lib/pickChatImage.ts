import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CHAT_MAX_IMAGES_PER_MESSAGE } from '@shiren/shared';
import { appAlert } from './appAlert';
import { zh } from '../locales/zh-CN';

export type PickedChatImage = {
  id: string;
  uri: string;
  base64?: string | null;
  mimeType?: string | null;
};

function newId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toPicked(asset: ImagePicker.ImagePickerAsset): PickedChatImage {
  return {
    id: newId(),
    uri: asset.uri,
    base64: asset.base64,
    mimeType: asset.mimeType ?? 'image/jpeg',
  };
}

/** 系统选择：拍照或从相册选图（可多选） */
export function promptChatImageSource(
  onChoice: (source: 'camera' | 'library') => void,
): void {
  appAlert(zh.chat.pickImageTitle, zh.chat.pickImageMessage, [
    { text: zh.chat.pickImageCamera, onPress: () => onChoice('camera') },
    { text: zh.chat.pickImageLibrary, onPress: () => onChoice('library') },
    { text: zh.writing.cancel, style: 'cancel' },
  ]);
}

async function ensureLibraryPermission(): Promise<boolean> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    appAlert('提示', zh.writing.ocrPermissionDenied);
    return false;
  }
  return true;
}

async function ensureCameraPermission(): Promise<boolean> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    appAlert('提示', zh.chat.cameraPermissionDenied);
    return false;
  }
  return true;
}

const pickerPresentation =
  Platform.OS === 'ios'
    ? ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN
    : undefined;

export async function pickChatImagesFromSource(
  source: 'camera' | 'library',
  options?: { remainingSlots?: number },
): Promise<PickedChatImage[]> {
  const maxPick = Math.min(
    options?.remainingSlots ?? CHAT_MAX_IMAGES_PER_MESSAGE,
    CHAT_MAX_IMAGES_PER_MESSAGE,
  );
  if (maxPick <= 0) {
    appAlert('提示', zh.chat.imageLimitReached);
    return [];
  }

  if (source === 'library') {
    if (!(await ensureLibraryPermission())) return [];
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      base64: true,
      allowsEditing: false,
      allowsMultipleSelection: maxPick > 1,
      selectionLimit: maxPick,
      presentationStyle: pickerPresentation,
    });
    if (picked.canceled || !picked.assets.length) return [];
    return picked.assets.map(toPicked);
  }

  if (!(await ensureCameraPermission())) return [];
  const picked = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    base64: true,
    allowsEditing: false,
    presentationStyle: pickerPresentation,
  });
  if (picked.canceled || !picked.assets[0]) return [];
  return [toPicked(picked.assets[0])];
}
