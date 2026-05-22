import Constants from 'expo-constants';
import { Platform } from 'react-native';
import NativeSourceCode from 'react-native/Libraries/NativeModules/specs/NativeSourceCode';
import { SHIREN_API_PORT } from '@shiren/shared';

/** 从 Metro bundle 地址取电脑 IP（真机与 Metro 同机时最可靠） */
function hostFromScriptUrl(): string | null {
  try {
    const scriptURL = NativeSourceCode.getConstants().scriptURL;
    if (!scriptURL || scriptURL.startsWith('file:')) return null;
    const host = scriptURL.match(/^https?:\/\/([^/:]+)/)?.[1];
    if (!host || host === 'localhost' || host === '127.0.0.1') return null;
    return host;
  } catch {
    return null;
  }
}

/** 从 Expo 开发服务地址推断电脑 IP */
function hostFromExpoConfig(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2
      ?.extra?.expoClient?.hostUri;

  if (!hostUri) return null;
  const host = hostUri.split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1') return null;
  return host;
}

function getDevHost(): string {
  const fromBundle = hostFromScriptUrl();
  if (fromBundle) return fromBundle;

  const fromExpo = hostFromExpoConfig();
  if (fromExpo) return fromExpo;

  if (Platform.OS === 'android') return '10.0.2.2';
  return '127.0.0.1';
}

/** App 以本地存储 + 直连厂商 API 为主，不经诗人后端 */
export const LOCAL_FIRST_MODE = true;

/** 开发环境 API 地址（默认端口 3921；仅遗留云 API / 健康检查用） */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? `http://${getDevHost()}:${SHIREN_API_PORT}`;
