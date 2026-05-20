import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { WritingStack } from './WritingStack';
import { ChatScreen } from '../screens/ChatScreen';
import { MeStack } from './MeStack';
import type { RootTabParamList } from './types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { zh } from '../locales/zh-CN';
import { useLayout } from '../theme/layout';

const Tab = createBottomTabNavigator<RootTabParamList>();

export function RootTabs() {
  const insets = useSafeAreaInsets();
  const { isTablet, tabBarHeight } = useLayout();

  return (
    <Tab.Navigator
      screenOptions={{
        lazy: true,
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, isTablet ? 8 : 4),
          paddingTop: isTablet ? 6 : 4,
          height: tabBarHeight + insets.bottom,
        },
        tabBarLabelStyle: { fontSize: isTablet ? 22 : 20, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="WritingTab"
        component={WritingStack}
        options={{ tabBarLabel: zh.tabs.writing }}
      />
      <Tab.Screen
        name="ChatTab"
        component={ChatScreen}
        options={{ tabBarLabel: zh.tabs.chat }}
      />
      <Tab.Screen
        name="MeTab"
        component={MeStack}
        options={{
          tabBarLabel: zh.tabs.me,
          headerShown: !isTablet,
          title: zh.me.title,
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: {
            fontWeight: '700',
            color: colors.text,
            fontSize: isTablet ? 28 : 24,
          },
        }}
      />
    </Tab.Navigator>
  );
}
