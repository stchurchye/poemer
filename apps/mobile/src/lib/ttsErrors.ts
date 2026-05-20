/** 用户切页 / 主动停止朗读，不应弹「朗读没成功」 */
export class TtsPlaybackStopped extends Error {
  readonly code = 'TTS_STOPPED';

  constructor() {
    super('朗读已停止');
    this.name = 'TtsPlaybackStopped';
  }
}

export function isTtsStoppedError(e: unknown): boolean {
  if (e instanceof TtsPlaybackStopped) return true;
  const err = e as { code?: string };
  return err?.code === 'TTS_STOPPED';
}
