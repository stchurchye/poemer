import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

export type AppVersionInfo = {
  appVersion: string;
  nativeBuildVersion: string | null;
  runtimeVersion: string | null;
  channel: string | null;
  updateId: string | null;
  updateCreatedAt: Date | null;
  isEmbeddedLaunch: boolean;
  isDev: boolean;
  updatesEnabled: boolean;
};

export function getAppVersionInfo(): AppVersionInfo {
  return {
    appVersion: Constants.expoConfig?.version ?? '—',
    nativeBuildVersion: Constants.nativeBuildVersion ?? null,
    runtimeVersion: Updates.runtimeVersion,
    channel: Updates.channel,
    updateId: Updates.updateId,
    updateCreatedAt: Updates.createdAt,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    isDev: __DEV__,
    updatesEnabled: Updates.isEnabled,
  };
}

function formatDateTime(d: Date): string {
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** 设置页底部：版本号 + 当前包更新时间 */
export function getAppVersionFooterLabel(info: AppVersionInfo): string {
  if (info.isDev) {
    return `版本 ${info.appVersion}`;
  }
  const timeLabel = info.updateCreatedAt ? formatDateTime(info.updateCreatedAt) : null;
  return timeLabel ? `${info.appVersion} · ${timeLabel}` : `版本 ${info.appVersion}`;
}

export function canManualOtaUpdate(info: AppVersionInfo): boolean {
  return !info.isDev && info.updatesEnabled;
}
