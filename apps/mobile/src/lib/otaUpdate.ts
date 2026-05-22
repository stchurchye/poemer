import * as Updates from 'expo-updates';
import { appAlert } from './appAlert';
import { zh } from '../locales/zh-CN';

export type OtaManualPhase = 'idle' | 'checking' | 'downloading';

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
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) {
      onPhase('idle');
      appAlert('提示', zh.me.otaNoUpdate);
      return;
    }

    onPhase('downloading');
    const fetched = await Updates.fetchUpdateAsync();
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
  } catch {
    onPhase('idle');
    appAlert('提示', zh.me.otaCheckFailed);
  }
}
