import { Platform } from 'react-native';
import { deleteFileQuietly, readFileBase64 } from './fsLegacy';
import { api } from './api';
import { clientLog } from './clientLog';
import { cancelAssistantFeedback } from './assistantFeedback';
import { ensureSpeechPermissions } from './speech/localRecognition';
import { getDashScopeApiKey } from './dashscopeKey';

type ExpoAv = typeof import('expo-av');
type Recording = InstanceType<ExpoAv['Audio']['Recording']>;

let avModule: ExpoAv | null = null;
let avLoadError: Error | null = null;
let recording: Recording | null = null;

export function nativeModuleRebuildHint(): string {
  if (Platform.OS === 'android') {
    return '云端听写需要重新编译 App（expo-av 原生模块未编入）。请安装最新 EAS 预览包，或在 apps/mobile 执行 npm run android 后重装';
  }
  return '云端听写需要重新编译 App（expo-av 原生模块未编入）。请在 apps/mobile 执行 npx pod-install，再 npm run ios 或 ios:ipad 后重装';
}

export type CloudSpeechStatus =
  | { ok: true }
  | { ok: false; reason: 'no_key' }
  | { ok: false; reason: 'no_native' };

/** 百炼密钥 + expo-av 是否可用于云端按住说话 */
export async function getCloudSpeechStatus(): Promise<CloudSpeechStatus> {
  if (!(await getDashScopeApiKey())) {
    return { ok: false, reason: 'no_key' };
  }
  try {
    await getAv();
    return { ok: true };
  } catch {
    return { ok: false, reason: 'no_native' };
  }
}

async function getAv(): Promise<ExpoAv> {
  if (avModule) return avModule;
  if (avLoadError) throw avLoadError;
  try {
    avModule = await import('expo-av');
    return avModule;
  } catch (e) {
    avLoadError =
      e instanceof Error ? e : new Error(nativeModuleRebuildHint());
    throw avLoadError;
  }
}

function audioFormatFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.wav')) return 'wav';
  if (lower.endsWith('.mp3')) return 'mp3';
  if (lower.endsWith('.caf')) return 'wav';
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4') || lower.endsWith('.aac')) return 'mp4';
  return 'mp4';
}

/** 已配置百炼密钥且本机已编入 expo-av 时启用云端听写（Qwen3-ASR-Flash） */
export async function hasCloudSpeech(): Promise<boolean> {
  const status = await getCloudSpeechStatus();
  return status.ok;
}

export async function prepareCloudRecording(): Promise<void> {
  await cancelAssistantFeedback();
  const granted = await ensureSpeechPermissions();
  if (!granted) {
    throw new Error('需要麦克风权限才能听您说话');
  }
  const { Audio } = await getAv();
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
  });
}

export async function startCloudRecording(): Promise<void> {
  const { Audio } = await getAv();
  await prepareCloudRecording();
  if (recording) {
    try {
      await recording.stopAndUnloadAsync();
    } catch {
      // ignore
    }
    recording = null;
  }
  const rec = new Audio.Recording();
  await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  await rec.startAsync();
  recording = rec;
  clientLog('asr.record.start', {});
}

export async function stopCloudRecordingAndTranscribe(): Promise<string> {
  if (!recording) return '';
  await recording.stopAndUnloadAsync();
  await new Promise((r) => setTimeout(r, 120));
  const uri = recording.getURI();
  recording = null;
  if (!uri) {
    clientLog('asr.record.no_uri', {});
    throw new Error('录音文件没生成，请再试一次');
  }

  try {
    const base64 = await readFileBase64(uri);
    if (!base64 || base64.length < 200) {
      clientLog('asr.record.empty', { bytes: base64?.length ?? 0 });
      throw new Error('录音太短或为空，请按住多说一会儿');
    }

    const format = audioFormatFromUri(uri);
    clientLog('asr.transcribe.request', { format, bytes: base64.length });

    const res = await api.transcribeAudio({ audioBase64: base64, format });
    clientLog('asr.transcribe.ok', { chars: res.data.text.length });
    return res.data.text.trim();
  } catch (e) {
    clientLog('asr.transcribe.fail', { error: String(e) });
    throw e;
  } finally {
    await deleteFileQuietly(uri);
    const { Audio } = await getAv();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });
  }
}

export async function cancelCloudRecording(): Promise<void> {
  if (!recording) return;
  try {
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    if (uri) await deleteFileQuietly(uri);
  } catch {
    // ignore
  }
  recording = null;
}
