import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppAlertProvider } from './src/components/AppAlertProvider';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { FontPreferencesProvider } from './src/theme/FontPreferencesContext';
import { RootTabs } from './src/navigation/RootTabs';

export default function App() {
  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <FontPreferencesProvider>
        <AppAlertProvider>
          <NavigationContainer>
            <StatusBar style="dark" />
            <RootTabs />
          </NavigationContainer>
        </AppAlertProvider>
        </FontPreferencesProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
