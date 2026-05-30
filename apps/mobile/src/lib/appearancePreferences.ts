import * as SecureStore from 'expo-secure-store';

export type Appearance = 'light' | 'dark';

const APPEARANCE_KEY = 'shiren_appearance';

/** 进程内缓存：切换主题后立即生效，同会话内避免重复读盘 */
let memoryAppearance: Appearance | null = null;

export function getMemoryAppearance(): Appearance | null {
  return memoryAppearance;
}

export function isAppearance(v: string | null | undefined): v is Appearance {
  return v === 'light' || v === 'dark';
}

export async function getStoredAppearance(): Promise<Appearance> {
  if (memoryAppearance) return memoryAppearance;
  try {
    const v = await SecureStore.getItemAsync(APPEARANCE_KEY);
    const next = isAppearance(v) ? v : 'light';
    memoryAppearance = next;
    return next;
  } catch {
    memoryAppearance = 'light';
    return 'light';
  }
}

export async function setStoredAppearance(appearance: Appearance): Promise<void> {
  memoryAppearance = appearance;
  await SecureStore.setItemAsync(APPEARANCE_KEY, appearance);
}
