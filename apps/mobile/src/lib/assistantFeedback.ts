import { getAssistantThinkingLine } from './assistantCopy';
import { speakText, stopSpeaking } from './tts';

type ExpoAv = typeof import('expo-av');

let speakGeneration = 0;
let readySoundPlayGeneration = 0;
let readySound: import('expo-av').Audio.Sound | null = null;
let audioModeReady = false;

function bumpGeneration(): number {
  speakGeneration += 1;
  return speakGeneration;
}

function speakTextAsync(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return Promise.resolve();
  return new Promise((resolve) => {
    void speakText(trimmed, {
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

async function getAv(): Promise<ExpoAv | null> {
  try {
    return await import('expo-av');
  } catch {
    return null;
  }
}

async function ensurePlaybackAudioMode(av: ExpoAv): Promise<void> {
  if (audioModeReady) return;
  await av.Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    allowsRecordingIOS: false,
    interruptionModeAndroid: av.InterruptionModeAndroid.DuckOthers,
    shouldDuckAndroid: true,
  });
  audioModeReady = true;
}

/** 短促提示音：助手回复已就绪（不阻塞 UI） */
export function playAssistantReadySound(): void {
  const gen = ++readySoundPlayGeneration;
  void (async () => {
    const av = await getAv();
    if (!av || gen !== readySoundPlayGeneration) return;

    try {
      await ensurePlaybackAudioMode(av);
      const { sound } = await av.Audio.Sound.createAsync(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../../assets/sounds/assistant-ready.wav'),
        { shouldPlay: true, volume: 0.65 },
      );
      if (gen !== readySoundPlayGeneration) {
        await sound.unloadAsync();
        return;
      }
      if (readySound) {
        try {
          await readySound.stopAsync();
          await readySound.unloadAsync();
        } catch {
          // ignore
        }
      }
      readySound = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          void sound.unloadAsync();
          if (readySound === sound) readySound = null;
        }
      });
    } catch {
      // ignore
    }
  })();
}

/** 等待气泡：念出文案，不阻塞界面 */
export function announceAssistantWaiting(text?: string): void {
  const gen = bumpGeneration();
  void (async () => {
    await stopSpeaking();
    if (gen !== speakGeneration) return;
    const line = text ?? (await getAssistantThinkingLine());
    await speakTextAsync(line);
  })();
}

/** 念出助手话术（带提示音，用于意图确认等） */
export function announceAssistantSpeak(text?: string): void {
  const trimmed = text?.trim();
  if (!trimmed) return;
  playAssistantReadySound();
  const gen = bumpGeneration();
  void (async () => {
    await stopSpeaking();
    if (gen !== speakGeneration) return;
    await speakTextAsync(trimmed);
  })();
}

/** 回复到达：提示音 + 朗读，与打字机展示并行 */
export function announceAssistantReplyParallel(fullText: string): void {
  const trimmed = fullText.trim();
  if (!trimmed) return;

  playAssistantReadySound();
  const gen = bumpGeneration();
  void stopSpeaking();
  void (async () => {
    if (gen !== speakGeneration) return;
    await speakTextAsync(trimmed);
  })();
}

/** 回复到达：先合成/起播 TTS，resolve 后再开打字机，使文字与语音同步 */
export function announceAssistantReplySync(fullText: string): Promise<void> {
  const trimmed = fullText.trim();
  if (!trimmed) return Promise.resolve();

  playAssistantReadySound();
  const gen = bumpGeneration();
  void stopSpeaking();

  return new Promise<void>((resolve) => {
    let resolved = false;
    const doResolve = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    const timer = setTimeout(doResolve, 5_000);

    void (async () => {
      if (gen !== speakGeneration) {
        clearTimeout(timer);
        doResolve();
        return;
      }
      try {
        await speakText(trimmed, {
          onStart: () => {
            clearTimeout(timer);
            doResolve();
          },
          onDone: () => {
            clearTimeout(timer);
            doResolve();
          },
          onStopped: () => {
            clearTimeout(timer);
            doResolve();
          },
          onError: () => {
            clearTimeout(timer);
            doResolve();
          },
        });
      } catch {
        clearTimeout(timer);
        doResolve();
      }
    })();
  });
}

export async function cancelAssistantFeedback(): Promise<void> {
  bumpGeneration();
  readySoundPlayGeneration += 1;
  await stopSpeaking();
  if (readySound) {
    try {
      await readySound.stopAsync();
      await readySound.unloadAsync();
    } catch {
      // ignore
    }
    readySound = null;
  }
}
