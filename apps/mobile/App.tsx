import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppAlertProvider } from './src/components/AppAlertProvider';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { FontPreferencesProvider } from './src/theme/FontPreferencesContext';
import { ApiConnectivityProvider } from './src/context/ApiConnectivityContext';
import { LocalStoreProvider } from './src/context/LocalStoreContext';
import { RootTabs } from './src/navigation/RootTabs';

export default function App() {
  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <FontPreferencesProvider>
        <LocalStoreProvider>
        <ApiConnectivityProvider>
        <AppAlertProvider>
          <NavigationContainer>
            <StatusBar style="dark" />
            <RootTabs />
          </NavigationContainer>
        </AppAlertProvider>
        </ApiConnectivityProvider>
        </LocalStoreProvider>
        </FontPreferencesProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
