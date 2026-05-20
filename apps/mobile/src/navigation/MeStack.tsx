import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ApiKeysScreen } from '../screens/ApiKeysScreen';
import { MeScreen } from '../screens/MeScreen';
import type { MeStackParamList } from './types';
import { colors } from '../theme/colors';
import { zh } from '../locales/zh-CN';

const Stack = createNativeStackNavigator<MeStackParamList>();

export function MeStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="MeMain" component={MeScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="ApiKeys"
        component={ApiKeysScreen}
        options={{ title: zh.me.keysMenuTitle }}
      />
    </Stack.Navigator>
  );
}
