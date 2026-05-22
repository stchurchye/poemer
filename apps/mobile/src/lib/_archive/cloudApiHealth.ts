/**
 * @deprecated 本地优先 App 不再探测诗人 API。归档自 apiConnectivity.ts。
 */
import { API_BASE_URL } from '../config';

export function formatApiServerAddress(baseUrl: string = API_BASE_URL): string {
  return baseUrl.replace(/\/$/, '');
}

const HEALTH_TIMEOUT_MS = 8_000;

/** 探测 API 是否可达（云 API 模式用） */
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
