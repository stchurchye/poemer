import { Platform } from 'react-native';
import type { ExpoSpeechRecognitionErrorCode } from 'expo-speech-recognition';
import { zh } from '../../locales/zh-CN';

const appName = zh.app.name;

const IOS_SERVICE_NOT_ALLOWED =
  '听写服务未就绪。请在「设置 → Siri 与搜索」打开 Siri，并在「设置 → 键盘」打开听写';

const ANDROID_SERVICE_NOT_ALLOWED =
  `听写服务未就绪。请在「设置 → 应用 → ${appName} → 权限」打开麦克风；并确认已安装 Google 应用或系统语音识别，首次使用可能需要下载中文离线语音包`;

const IOS_RECOGNIZER_INIT_HINT =
  '听写引擎没启动成功。\n\n' +
  '• 真机：请打开「设置 → Siri 与搜索」里的 Siri，以及「设置 → 键盘 → 启用听写」\n' +
  '• 模拟器：多数情况下不支持语音听写，请换真机测试';

const ANDROID_RECOGNIZER_INIT_HINT =
  '听写引擎没启动成功。\n\n' +
  `• 请在「设置 → 应用 → ${appName} → 权限」打开麦克风\n` +
  '• 确认已安装 Google 应用，或在系统设置里启用语音识别\n' +
  '• 首次使用中文听写时，请按提示下载离线语音包后再试';

const MESSAGES: Partial<Record<ExpoSpeechRecognitionErrorCode, string>> = {
  'not-allowed':
    Platform.OS === 'android'
      ? `需要允许使用麦克风，请在「设置 → 应用 → ${appName} → 权限」里打开`
      : '需要允许使用麦克风和语音识别，请在设置里打开',
  'no-speech': '没听清您说的话，请靠近手机再说一次，不着急',
  'speech-timeout': '没听清您说的话，请靠近手机再说一次，不着急',
  network: '听写需要连一下网，请打开无线网后再试',
  'language-not-supported': '这台手机暂不支持中文听写，请改用键盘输入',
  'service-not-allowed':
    Platform.OS === 'android' ? ANDROID_SERVICE_NOT_ALLOWED : IOS_SERVICE_NOT_ALLOWED,
  'audio-capture': '麦克风或听写服务暂时不可用，请稍后再试',
  busy: '上一次的听写还没结束，请稍等一秒再试',
  aborted: '已取消',
};

function messageFromNativeText(message?: string): string | undefined {
  const m = (message ?? '').toLowerCase();
  if (
    m.includes('failed to initialize recognizer') ||
    m.includes("can't initialize speech recognizer") ||
    m.includes('initialize recognizer') ||
    m.includes('assets are not installed') ||
    m.includes('siri or dictation is disabled')
  ) {
    return Platform.OS === 'android' ? ANDROID_RECOGNIZER_INIT_HINT : IOS_RECOGNIZER_INIT_HINT;
  }
  if (
    Platform.OS === 'android' &&
    (m.includes('offline') ||
      m.includes('language pack') ||
      m.includes('model') ||
      m.includes('not available'))
  ) {
    return (
      '中文听写可能需要先下载离线语音包。\n\n' +
      '请在系统提示时允许下载，或打开 Google 应用 / 系统「语音识别」设置后再试'
    );
  }
  return undefined;
}

export function speechErrorMessage(
  code: ExpoSpeechRecognitionErrorCode,
  fallback?: string,
): string {
  return messageFromNativeText(fallback) ?? MESSAGES[code] ?? fallback ?? '听写没成功，请再试一次';
}
