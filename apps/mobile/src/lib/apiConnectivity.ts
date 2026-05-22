import { API_BASE_URL } from './config';
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

export function formatApiServerAddress(baseUrl: string = API_BASE_URL): string {
  return baseUrl.replace(/\/$/, '');
}

export function isConnectivityErrorCode(code?: string): boolean {
  return code === 'NETWORK' || code === 'TIMEOUT' || code === 'BAD_RESPONSE';
}

export function networkErrorMessage(
  code?: string,
  baseUrl: string = API_BASE_URL,
): string {
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

const HEALTH_TIMEOUT_MS = 8_000;

/** 探测 API 是否可达（用于重连按钮与启动检查） */
export async function checkApiHealth(
  baseUrl: string = API_BASE_URL,
): Promise<boolean> {
  const url = `${formatApiServerAddress(baseUrl)}/health`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) return false;
    const json = (await res.json()) as { ok?: boolean };
    return json.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

type ConnectivityListener = () => void;

let onReachableListener: ConnectivityListener | null = null;
let onUnreachableListener: ConnectivityListener | null = null;

export function registerConnectivityListeners(handlers: {
  onReachable?: ConnectivityListener;
  onUnreachable?: ConnectivityListener;
}): () => void {
  onReachableListener = handlers.onReachable ?? null;
  onUnreachableListener = handlers.onUnreachable ?? null;
  return () => {
    onReachableListener = null;
    onUnreachableListener = null;
  };
}

export function notifyApiReachable(): void {
  onReachableListener?.();
}

export function notifyApiUnreachable(): void {
  onUnreachableListener?.();
}
