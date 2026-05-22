import { useEffect } from 'react';
import * as Updates from 'expo-updates';

/** 生产包启动时拉取 preview/production OTA，有新包则立即 reload（开发模式跳过） */
export function useOtaUpdateOnLaunch() {
  useEffect(() => {
    if (__DEV__) return;

    void (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;
        const fetched = await Updates.fetchUpdateAsync();
        if (fetched.isNew) {
          await Updates.reloadAsync();
        }
      } catch {
        // 离线、未启用 updates 等：沿用内置包
      }
    })();
  }, []);
}
