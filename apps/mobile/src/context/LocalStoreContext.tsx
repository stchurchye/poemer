import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import {
  createLocalStore,
  ReplacementAwareTaskQueue,
  type LocalStore,
  type PersistedStore,
} from '@shiren/shared';
import {
  loadLocalPersistedStore,
  saveLocalPersistedStore,
} from '../lib/localDataFiles';
import { registerLocalApiRuntime } from '../lib/localApiRuntime';
import { appAlert } from '../lib/appAlert';
import { LoadErrorView } from '../components/LoadErrorView';
import { zh } from '../locales/zh-CN';
import { useColors } from '../theme/ThemeContext';

type LocalStoreContextValue = {
  store: LocalStore | null;
  ready: boolean;
  generation: number;
  snapshot: () => PersistedStore | null;
  persistNow: () => Promise<void>;
  replaceStore: (next: PersistedStore) => Promise<void>;
  markChanged: () => void;
};

const LocalStoreContext = createContext<LocalStoreContextValue | null>(null);
const SAVE_DEBOUNCE_MS = 400;
const SAVE_RETRY_MS = 1500;

function LocalStoreLoadingView() {
  const colors = useColors();
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function LocalStoreProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<LocalStore | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFailureAlertedRef = useRef(false);
  const writeQueueRef = useRef(new ReplacementAwareTaskQueue());
  const [store, setStore] = useState<LocalStore | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [generation, setGeneration] = useState(0);

  const persistNow = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await writeQueueRef.current.enqueueSave(async () => {
      const current = storeRef.current;
      if (!current) return;
      await saveLocalPersistedStore(current.snapshot());
    });
  }, []);

  const persistWithRetry = useCallback(async () => {
    try {
      await persistNow();
      saveFailureAlertedRef.current = false;
    } catch {
      if (!saveFailureAlertedRef.current) {
        saveFailureAlertedRef.current = true;
        appAlert('本地保存没成功', '会自动再试一次；请暂时不要退出应用。');
      }
      if (!retryTimerRef.current) {
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          void persistNow()
            .then(() => {
              saveFailureAlertedRef.current = false;
            })
            .catch(() => undefined);
        }, SAVE_RETRY_MS);
      }
    }
  }, [persistNow]);

  const markChanged = useCallback(() => {
    setGeneration((n) => n + 1);
    if (writeQueueRef.current.replacing) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persistWithRetry();
    }, SAVE_DEBOUNCE_MS);
  }, [persistWithRetry]);

  const replaceStore = useCallback(
    async (next: PersistedStore) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      try {
        await writeQueueRef.current.enqueueReplacement(async () => {
          const previous = storeRef.current?.snapshot();
          if (previous && (previous.documents.length > 0 || previous.chatSessions.length > 0)) {
            await saveLocalPersistedStore(previous);
          }
          await saveLocalPersistedStore(next);
          const instance = createLocalStore(next);
          storeRef.current = instance;
          setStore(instance);
          setGeneration((n) => n + 1);
        });
      } finally {
        if (!writeQueueRef.current.replacing && saveFailureAlertedRef.current) {
          saveFailureAlertedRef.current = false;
        }
      }
    },
    [],
  );

  useEffect(() => {
    return registerLocalApiRuntime({
      getStore: () => storeRef.current,
      markChanged,
    });
  }, [markChanged]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void persistWithRetry();
    });
    return () => subscription.remove();
  }, [persistWithRetry]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    void (async () => {
      try {
        const result = await loadLocalPersistedStore();
        if (cancelled) return;
        const instance = createLocalStore(result.store);
        storeRef.current = instance;
        setStore(instance);
        setReady(true);
        setGeneration((n) => n + 1);
        if (result.recoveredFromBackup) {
          appAlert('提示', zh.me.localDataRecovered);
        }
      } catch {
        if (!cancelled) {
          setReady(false);
          setLoadError('本地数据暂时读取不了，原文件没有被覆盖。');
        }
      }
    })();
    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      void persistNow().catch(() => undefined);
    };
  }, [persistNow, loadAttempt]);

  const value = useMemo(
    () => ({
      store,
      ready,
      generation,
      snapshot: () => storeRef.current?.snapshot() ?? null,
      persistNow,
      replaceStore,
      markChanged,
    }),
    [store, ready, generation, persistNow, replaceStore, markChanged],
  );

  if (loadError) {
    return (
      <LoadErrorView
        message={loadError}
        hint="请稍后重试；如果仍失败，可重新打开应用。"
        onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
      />
    );
  }

  if (!ready) {
    return <LocalStoreLoadingView />;
  }

  return (
    <LocalStoreContext.Provider value={value}>{children}</LocalStoreContext.Provider>
  );
}

export function useLocalStore(): LocalStoreContextValue {
  const ctx = useContext(LocalStoreContext);
  if (!ctx) throw new Error('useLocalStore must be used within LocalStoreProvider');
  return ctx;
}
