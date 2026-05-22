import { API_BASE_URL, LOCAL_FIRST_MODE } from './config';
import { zh } from '../locales/zh-CN';

export type ApiHostKind = 'localDev' | 'lanDev' | 'cloud';

export function classifyApiHost(baseUrl: string = API_BASE_URL): ApiHostKind {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    if (host === '10.0.2.2' || host === '127.0.0.1' || host === 'localhost') {
      return 'localDev';
    }
    if (
      /^192\.168\.\d+\.\d+$/.test(host) ||
      /^10\.\d+\.\d+\.\d+$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)
    ) {
      return 'lanDev';
    }
    return 'cloud';
  } catch {
    return 'cloud';
  }
}

function formatApiServerAddress(baseUrl: string = API_BASE_URL): string {
  return baseUrl.replace(/\/$/, '');
}

export function isConnectivityErrorCode(code?: string): boolean {
  return code === 'NETWORK' || code === 'TIMEOUT' || code === 'BAD_RESPONSE';
}

export function networkErrorMessage(
  code?: string,
  baseUrl: string = API_BASE_URL,
): string {
  if (LOCAL_FIRST_MODE) {
    if (code === 'TIMEOUT') return zh.network.timeout;
    if (code === 'BAD_RESPONSE') return zh.network.badResponse;
    return zh.network.unreachableLocalFirst;
  }

  const hostKind = classifyApiHost(baseUrl);

  if (code === 'TIMEOUT') {
    return zh.network.timeout;
  }
  if (code === 'BAD_RESPONSE') {
    return zh.network.badResponse;
  }

  if (hostKind === 'cloud') {
    return zh.network.unreachableCloud;
  }
  if (hostKind === 'lanDev') {
    return zh.network.unreachableLan;
  }
  return zh.network.unreachableLocal;
}

export function networkErrorHint(baseUrl: string = API_BASE_URL): string {
  if (LOCAL_FIRST_MODE) {
    return zh.network.hintLocalFirst;
  }

  const hostKind = classifyApiHost(baseUrl);
  const address = formatApiServerAddress(baseUrl);

  if (hostKind === 'cloud') {
    return `${zh.network.hintCloud}\n${zh.network.serverAddress(address)}`;
  }
  if (hostKind === 'lanDev') {
    return `${zh.network.hintLan}\n${zh.network.serverAddress(address)}`;
  }
  return `${zh.network.hintLocal}\n${zh.network.serverAddress(address)}`;
}

export function networkErrorDetail(
  code?: string,
  baseUrl: string = API_BASE_URL,
): { message: string; hint: string } {
  return {
    message: networkErrorMessage(code, baseUrl),
    hint: networkErrorHint(baseUrl),
  };
}

/** 仅对明确与网络/厂商相关的错误追加默认 hint（见 apiLoadErrorText） */
export function shouldAppendNetworkHint(code?: string): boolean {
  if (isConnectivityErrorCode(code)) return true;
  if (code?.startsWith('MODEL_')) return true;
  return code === 'VENDOR_NETWORK';
}
