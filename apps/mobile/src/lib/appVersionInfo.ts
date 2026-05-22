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

/** 设置页底部展示用，每行一条 */
export function formatAppVersionFooterLines(info: AppVersionInfo): string[] {
  if (info.isDev) {
    return [`版本 ${info.appVersion}`, '开发模式（不走热更新）'];
  }

  const versionLabel = info.nativeBuildVersion
    ? `版本 ${info.appVersion}（${info.nativeBuildVersion}）`
    : `版本 ${info.appVersion}`;
  const channelLabel = info.channel ? `渠道 ${info.channel}` : '渠道未配置';
  const lines = [`${versionLabel} · ${channelLabel}`];

  if (!info.updatesEnabled) {
    lines.push('热更新未启用');
    return lines;
  }

  if (info.isEmbeddedLaunch) {
    lines.push('热更新：内置包（安装后尚未拉到线上更新）');
    return lines;
  }

  const shortId = info.updateId?.slice(0, 8) ?? '—';
  const timeLabel = info.updateCreatedAt
    ? formatDateTime(info.updateCreatedAt)
    : '—';
  lines.push(`热更新 ${shortId} · ${timeLabel}`);

  if (info.runtimeVersion) {
    lines.push(`运行时 ${info.runtimeVersion}`);
  }

  return lines;
}
