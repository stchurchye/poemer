import * as Updates from 'expo-updates';
import { appAlert } from './appAlert';
import { zh } from '../locales/zh-CN';
import { PromiseTimeoutError, withTimeout } from './promiseTimeout';

export type OtaManualPhase = 'idle' | 'checking' | 'downloading';

const CHECK_TIMEOUT_MS = 45_000;
const FETCH_TIMEOUT_MS = 120_000;

function otaFailureMessage(e: unknown): string {
  if (e instanceof PromiseTimeoutError) {
    return zh.me.otaTimeout;
  }
  const msg =
    e instanceof Error
      ? `${e.message} ${(e as Error & { cause?: unknown }).cause ?? ''}`
      : String(e);
  const lower = msg.toLowerCase();
  if (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('connect') ||
    lower.includes('internet') ||
    lower.includes('offline') ||
    lower.includes('unable to resolve')
  ) {
    return zh.me.otaNetworkError;
  }
  return zh.me.otaCheckFailed;
}

/** 用户主动检查并拉取 OTA；有新包时提示重启（与启动时自动更新同一套 expo-updates 流程） */
export async function runManualOtaUpdate(
  onPhase: (phase: OtaManualPhase) => void,
): Promise<void> {
  if (__DEV__) {
    appAlert('提示', zh.me.otaDevMode);
    return;
  }
  if (!Updates.isEnabled) {
    appAlert('提示', zh.me.otaDisabled);
    return;
  }

  onPhase('checking');
  try {
    const check = await withTimeout(
      Updates.checkForUpdateAsync(),
      CHECK_TIMEOUT_MS,
      'checkForUpdate',
    );
    if (!check.isAvailable) {
      onPhase('idle');
      appAlert('提示', zh.me.otaNoUpdate);
      return;
    }

    onPhase('downloading');
    const fetched = await withTimeout(
      Updates.fetchUpdateAsync(),
      FETCH_TIMEOUT_MS,
      'fetchUpdate',
    );
    onPhase('idle');

    if (!fetched.isNew) {
      appAlert('提示', zh.me.otaNoUpdate);
      return;
    }

    appAlert(zh.me.otaReadyTitle, zh.me.otaReadyMessage, [
      { text: zh.writing.cancel, style: 'cancel' },
      {
        text: zh.me.otaReloadNow,
        onPress: () => {
          void Updates.reloadAsync();
        },
      },
    ]);
  } catch (e) {
    onPhase('idle');
    if (__DEV__) {
      console.warn('[ota] manual update failed', e);
    }
    appAlert('提示', otaFailureMessage(e));
  }
}
