import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DiffPreviewScreen } from '../screens/DiffPreviewScreen';
import { DocumentLibraryScreen } from '../screens/DocumentLibraryScreen';
import { RevisionHistoryScreen } from '../screens/RevisionHistoryScreen';
import { WritingScreen } from '../screens/WritingScreen';
import type { WritingStackParamList } from './types';
import { colors } from '../theme/colors';
import { zh } from '../locales/zh-CN';

const Stack = createNativeStackNavigator<WritingStackParamList>();

export function WritingStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600' },
        headerBackTitle: zh.common.back,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="WritingMain"
        component={WritingScreen}
        options={{ headerShown: false, title: zh.common.back }}
      />
      <Stack.Screen
        name="DocumentLibrary"
        component={DocumentLibraryScreen}
        options={{ title: zh.writing.docLibraryTitle }}
      />
      <Stack.Screen
        name="DiffPreview"
        component={DiffPreviewScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RevisionHistory"
        component={RevisionHistoryScreen}
        options={{
          title: zh.writing.history,
          headerTitleStyle: { fontWeight: '600', fontSize: 34 },
        }}
      />
    </Stack.Navigator>
  );
}
