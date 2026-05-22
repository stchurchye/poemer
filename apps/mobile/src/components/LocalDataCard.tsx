import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import {
  exportLocalDataPackage,
  getLocalDataStatus,
  parseImportFile,
} from '../lib/localDataFiles';
import { useLocalStore } from '../context/LocalStoreContext';
import { appAlert } from '../lib/appAlert';
import { colors, typography } from '../theme/colors';
import { zh } from '../locales/zh-CN';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LocalDataCard() {
  const { snapshot, replaceStore } = useLocalStore();
  const [bytes, setBytes] = useState(0);

  const refresh = useCallback(async () => {
    const status = await getLocalDataStatus();
    setBytes(status.bytes);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const exportData = async () => {
    try {
      const store = snapshot();
      if (!store) throw new Error('LOCAL_STORE_NOT_READY');
      const { fileName, shared } = await exportLocalDataPackage(store);
      appAlert('好了', zh.me.localDataExportDone(fileName, shared));
      await refresh();
    } catch {
      appAlert('提示', zh.me.localDataExportFailed);
    }
  };

  const importData = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets[0]?.uri) return;
      appAlert(zh.me.localDataImportConfirmTitle, zh.me.localDataImportConfirmMessage, [
        { text: zh.writing.cancel, style: 'cancel' },
        {
          text: zh.common.confirm,
          onPress: () => {
            void (async () => {
              const store = await parseImportFile(picked.assets[0]!.uri);
              await replaceStore(store);
              appAlert('好了', zh.me.localDataImportDone);
              await refresh();
            })().catch(() => appAlert('提示', zh.me.localDataImportFailed));
          },
        },
      ]);
    } catch {
      appAlert('提示', zh.me.localDataImportFailed);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{zh.me.localDataTitle}</Text>
      <Text style={styles.body}>{zh.me.localDataMode}</Text>
      <Text style={styles.body}>{zh.me.localDataBackupHint}</Text>
      <Text style={styles.meta}>本地数据大小：{formatBytes(bytes)}</Text>
      <View style={styles.actions}>
        <Pressable style={styles.button} onPress={() => void exportData()}>
          <Text style={styles.buttonText}>{zh.me.localDataExport}</Text>
        </Pressable>
        <Pressable style={styles.buttonSecondary} onPress={() => void importData()}>
          <Text style={styles.buttonSecondaryText}>{zh.me.localDataImport}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
    gap: 10,
  },
  title: { fontSize: typography.button, fontWeight: '700', color: colors.text },
  body: {
    fontSize: typography.caption,
    color: colors.textMuted,
    lineHeight: Math.round(typography.caption * 1.45),
  },
  meta: { fontSize: typography.caption, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  button: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: typography.button },
  buttonSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonSecondaryText: { color: colors.text, fontWeight: '600', fontSize: typography.button },
});
