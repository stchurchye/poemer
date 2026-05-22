import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

/**
 * 本地优先模式：不探测诗人 API。保留 reconnectGeneration 供各屏在 App 回到前台时刷新本地数据。
 */
type ApiConnectivityValue = {
  reachable: boolean | null;
  checking: boolean;
  suppressGlobalBanner: boolean;
  bannerMessage: string;
  bannerHint: string;
  reconnectGeneration: number;
  checkNow: (options?: { refreshScreens?: boolean }) => Promise<boolean>;
  triggerReconnect: () => Promise<void>;
  setSuppressGlobalBanner: (suppress: boolean) => void;
};

const ApiConnectivityContext = createContext<ApiConnectivityValue | null>(null);

export function ApiConnectivityProvider({ children }: { children: ReactNode }) {
  const [reconnectGeneration, setReconnectGeneration] = useState(0);
  const [suppressGlobalBanner, setSuppressGlobalBanner] = useState(false);

  const bumpRefresh = useCallback((refreshScreens?: boolean) => {
    if (refreshScreens) {
      setReconnectGeneration((n) => n + 1);
    }
    return true;
  }, []);

  const checkNow = useCallback(
    async (options?: { refreshScreens?: boolean }) => bumpRefresh(options?.refreshScreens),
    [bumpRefresh],
  );

  const triggerReconnect = useCallback(async () => {
    await checkNow({ refreshScreens: true });
  }, [checkNow]);

  const setSuppressGlobalBannerState = useCallback((suppress: boolean) => {
    setSuppressGlobalBanner(suppress);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkNow({ refreshScreens: true });
    });
    return () => sub.remove();
  }, [checkNow]);

  const value = useMemo(
    () => ({
      reachable: true,
      checking: false,
      suppressGlobalBanner,
      bannerMessage: '',
      bannerHint: '',
      reconnectGeneration,
      checkNow,
      triggerReconnect,
      setSuppressGlobalBanner: setSuppressGlobalBannerState,
    }),
    [
      suppressGlobalBanner,
      reconnectGeneration,
      checkNow,
      triggerReconnect,
      setSuppressGlobalBannerState,
    ],
  );

  return (
    <ApiConnectivityContext.Provider value={value}>
      {children}
    </ApiConnectivityContext.Provider>
  );
}

export function useApiConnectivity(): ApiConnectivityValue {
  const ctx = useContext(ApiConnectivityContext);
  if (!ctx) {
    throw new Error('useApiConnectivity must be used within ApiConnectivityProvider');
  }
  return ctx;
}

export function useApiConnectivityOptional(): ApiConnectivityValue | null {
  return useContext(ApiConnectivityContext);
}

export function useSuppressGlobalOfflineBanner(suppress: boolean): void {
  const { setSuppressGlobalBanner } = useApiConnectivity();
  useEffect(() => {
    setSuppressGlobalBanner(suppress);
    return () => setSuppressGlobalBanner(false);
  }, [suppress, setSuppressGlobalBanner]);
}

export function useReconnectEffect(effect: () => void, deps: unknown[] = []): void {
  const { reconnectGeneration } = useApiConnectivity();
  useEffect(() => {
    if (reconnectGeneration === 0) return;
    effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generation 为显式刷新信号
  }, [reconnectGeneration, ...deps]);
}

export function getOfflineBannerCopy(): { message: string; hint: string } {
  return { message: '', hint: '' };
}
