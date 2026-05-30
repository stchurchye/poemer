import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppAlertProvider } from './src/components/AppAlertProvider';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { FontPreferencesProvider } from './src/theme/FontPreferencesContext';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { buildNavTheme } from './src/theme/buildNavTheme';
import { ApiConnectivityProvider } from './src/context/ApiConnectivityContext';
import { LocalStoreProvider } from './src/context/LocalStoreContext';
import { RootTabs } from './src/navigation/RootTabs';
import { useOtaUpdateOnLaunch } from './src/hooks/useOtaUpdateOnLaunch';

function AppNavigation() {
  const { appearance, colors } = useTheme();
  const navTheme = buildNavTheme(colors, appearance);

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={appearance === 'dark' ? 'light' : 'dark'} />
      <RootTabs />
    </NavigationContainer>
  );
}

export default function App() {
  useOtaUpdateOnLaunch();

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppErrorBoundary>
          <FontPreferencesProvider>
            <LocalStoreProvider>
              <ApiConnectivityProvider>
                <AppAlertProvider>
                  <AppNavigation />
                </AppAlertProvider>
              </ApiConnectivityProvider>
            </LocalStoreProvider>
          </FontPreferencesProvider>
        </AppErrorBoundary>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
