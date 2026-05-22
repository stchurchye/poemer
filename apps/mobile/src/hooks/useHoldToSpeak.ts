import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { appAlert } from '../lib/appAlert';
import { apiErrorText } from '../lib/apiError';
import {
  cancelCloudRecording,
  getCloudSpeechStatus,
  nativeModuleRebuildHint,
  prepareCloudRecording,
  startCloudRecording,
  stopCloudRecordingAndTranscribe,
} from '../lib/cloudSpeech';
import { speechErrorMessage } from '../lib/speech/errors';
import {
  abortListening,
  ensureSpeechPermissions,
  isIosSimulator,
  prepareAndroidOfflinePack,
  prepareSpeechEngine,
  resetStartProfile,
  rotateStartProfile,
  startListening,
  stopListening,
} from '../lib/speech/localRecognition';
import { zh } from '../locales/zh-CN';

const MIN_HOLD_MS = 400;
const END_SETTLE_MS = 250;

function joinTranscript(results: { transcript?: string }[] | undefined): string {
  if (!results?.length) return '';
  return results
    .map((r) => r.transcript?.trim() ?? '')
    .filter(Boolean)
    .join('');
}

export function useHoldToSpeak(onComplete: (text: string) => void) {
  const [holding, setHolding] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [cloudMode, setCloudMode] = useState(false);

  const fingerDownRef = useRef(false);
  const sessionActiveRef = useRef(false);
  const listenStartedRef = useRef(0);
  const transcriptRef = useRef('');
  const finalTranscriptRef = useRef('');
  const errorHandledRef = useRef(false);
  const userCancelledRef = useRef(false);
  const initRetryRef = useRef(0);
  const startGenerationRef = useRef(0);

  useEffect(() => {
    void (async () => {
      const status = await getCloudSpeechStatus();
      setCloudMode(status.ok);
      try {
        await ensureSpeechPermissions();
        await prepareSpeechEngine();
        await prepareAndroidOfflinePack();
      } catch {
        // 预检失败不阻塞，按住时会再试
      }
    })();
  }, []);

  useSpeechRecognitionEvent('start', () => {
    if (cloudMode) return;
    sessionActiveRef.current = true;
    listenStartedRef.current = Date.now();
    setHolding(true);
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (cloudMode) return;
    const text = joinTranscript(event.results);
    if (!text) return;
    transcriptRef.current = text;
    if (event.isFinal) finalTranscriptRef.current = text;
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (cloudMode) return;
    sessionActiveRef.current = false;
    setHolding(false);
    if (event.error === 'aborted' || userCancelledRef.current) {
      userCancelledRef.current = false;
      return;
    }

    const nativeMsg = (event.message ?? '').toLowerCase();
    const initFailed =
      nativeMsg.includes('initialize recognizer') ||
      nativeMsg.includes("can't initialize speech recognizer");

    if (initFailed && initRetryRef.current < 1 && rotateStartProfile() && fingerDownRef.current) {
      initRetryRef.current += 1;
      try {
        startListening();
        return;
      } catch {
        // fall through
      }
    }

    errorHandledRef.current = true;
    const holdMs = Date.now() - listenStartedRef.current;
    if (event.error === 'no-speech' && holdMs < MIN_HOLD_MS) return;
    appAlert('听写提示', speechErrorMessage(event.error, event.message));
  });

  useSpeechRecognitionEvent('end', () => {
    if (cloudMode) return;
    sessionActiveRef.current = false;
    setHolding(false);

    const holdMs = Date.now() - listenStartedRef.current;
    setTimeout(() => {
      if (errorHandledRef.current) {
        errorHandledRef.current = false;
        return;
      }
      if (userCancelledRef.current) {
        userCancelledRef.current = false;
        return;
      }

      const text = (finalTranscriptRef.current || transcriptRef.current).trim();
      transcriptRef.current = '';
      finalTranscriptRef.current = '';

      if (text) {
        onComplete(text);
        return;
      }
      if (holdMs < MIN_HOLD_MS) {
        appAlert('提示', zh.voice.holdLonger);
        return;
      }
      appAlert('没听清', speechErrorMessage('no-speech'));
    }, END_SETTLE_MS);
  });

  const alertCloudUnavailable = useCallback(async () => {
    const status = await getCloudSpeechStatus();
    if (status.ok) {
      setCloudMode(true);
      return false;
    }
    if (status.reason === 'no_key') {
      appAlert('按住说话', `${zh.me.dashscopeNotConfigured}\n\n未配置时仍可用手机自带听写，请再按住试一次。`);
      return true;
    }
    appAlert('按住说话不可用', nativeModuleRebuildHint());
    return true;
  }, []);

  const onPressIn = useCallback(async () => {
    if (transcribing) return;

    fingerDownRef.current = true;
    listenStartedRef.current = Date.now();

    const ok = await ensureSpeechPermissions();
    if (!fingerDownRef.current) return;
    if (!ok) {
      appAlert('需要权限', '需要麦克风权限才能按住说话', [
        { text: '去设置', onPress: () => void Linking.openSettings() },
        { text: '知道了', style: 'cancel' },
      ]);
      return;
    }

    if (cloudMode) {
      try {
        await prepareCloudRecording();
        await startCloudRecording();
        sessionActiveRef.current = true;
        setHolding(true);
      } catch (e) {
        sessionActiveRef.current = false;
        setHolding(false);
        const msg = String(e);
        setCloudMode(false);
        if (/permission|Permissions|原生模块|expo-av/i.test(msg)) {
          appAlert('听写提示', zh.voice.cloudFallbackLocal);
        } else {
          appAlert('没开始录音', msg);
        }
      }
      return;
    }

    const generation = ++startGenerationRef.current;
    userCancelledRef.current = false;
    errorHandledRef.current = false;
    initRetryRef.current = 0;
    resetStartProfile();
    transcriptRef.current = '';
    finalTranscriptRef.current = '';

    const engine = await prepareSpeechEngine();
    if (generation !== startGenerationRef.current) return;
    if (!fingerDownRef.current) return;

    if (!engine.ok) {
      const blocked = await alertCloudUnavailable();
      if (blocked) return;
      if (isIosSimulator()) {
        appAlert('听写不可用', zh.voice.simulatorHint);
      } else {
        appAlert('听写不可用', speechErrorMessage('service-not-allowed'));
      }
      return;
    }

    try {
      startListening();
    } catch {
      appAlert('听写提示', '暂时无法开始听您说话，请稍后再试');
    }
  }, [alertCloudUnavailable, cloudMode, transcribing]);

  const onPressOut = useCallback(() => {
    fingerDownRef.current = false;

    if (cloudMode && sessionActiveRef.current) {
      sessionActiveRef.current = false;
      setHolding(false);
      const held = Date.now() - listenStartedRef.current;
      if (held < MIN_HOLD_MS) {
        void cancelCloudRecording();
        appAlert('提示', zh.voice.holdLonger);
        return;
      }
      setTranscribing(true);
      void (async () => {
        try {
          const text = await stopCloudRecordingAndTranscribe();
          if (text) onComplete(text);
          else appAlert('没听清', '请再按住说一次');
        } catch (e) {
          const { message, hint } = apiErrorText(e);
          appAlert(message, hint ?? message);
        } finally {
          setTranscribing(false);
        }
      })();
      return;
    }

    if (!sessionActiveRef.current) {
      userCancelledRef.current = true;
      abortListening();
      setHolding(false);
      return;
    }

    const held = Date.now() - listenStartedRef.current;
    sessionActiveRef.current = false;
    setHolding(false);

    if (held < MIN_HOLD_MS) {
      setTimeout(() => {
        if (!fingerDownRef.current && sessionActiveRef.current) stopListening();
      }, MIN_HOLD_MS - held);
      return;
    }

    stopListening();
  }, [cloudMode, onComplete]);

  return { holding: holding || transcribing, transcribing, onPressIn, onPressOut };
}
