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
import { ActivityIndicator, View } from 'react-native';
import {
  createLocalStore,
  type LocalStore,
  type PersistedStore,
} from '@shiren/shared';
import {
  loadLocalPersistedStore,
  saveLocalPersistedStore,
} from '../lib/localDataFiles';
import { registerLocalApiRuntime } from '../lib/localApiRuntime';
import { appAlert } from '../lib/appAlert';
import { zh } from '../locales/zh-CN';

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

export function LocalStoreProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<LocalStore | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [store, setStore] = useState<LocalStore | null>(null);
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);

  const persistNow = useCallback(async () => {
    const current = storeRef.current;
    if (!current) return;
    await saveLocalPersistedStore(current.snapshot());
  }, []);

  const markChanged = useCallback(() => {
    setGeneration((n) => n + 1);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persistNow();
    }, SAVE_DEBOUNCE_MS);
  }, [persistNow]);

  const replaceStore = useCallback(
    async (next: PersistedStore) => {
      const current = storeRef.current;
      if (current) {
        const snap = current.snapshot();
        if (snap.documents.length > 0 || snap.chatSessions.length > 0) {
          await saveLocalPersistedStore(snap);
        }
      }
      const instance = createLocalStore(next);
      storeRef.current = instance;
      setStore(instance);
      await saveLocalPersistedStore(next);
      setGeneration((n) => n + 1);
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
    let cancelled = false;
    void (async () => {
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
    })();
    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      void persistNow();
    };
  }, [persistNow]);

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

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
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
