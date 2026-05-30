import type { ViewStyle } from 'react-native';
import type { ColorPalette } from '../theme/colors';

export type RootTabBarStyleInput = {
  colors: ColorPalette;
  bottomInset: number;
  isTablet: boolean;
  tabBarHeight: number;
  hidden?: boolean;
};

/** 与 RootTabs screenOptions.tabBarStyle 保持一致，供写作页 OCR 流程覆写 */
export function buildRootTabBarStyle({
  colors,
  bottomInset,
  isTablet,
  tabBarHeight,
  hidden = false,
}: RootTabBarStyleInput): ViewStyle {
  return {
    backgroundColor: colors.tabBar,
    borderTopColor: colors.border,
    paddingBottom: Math.max(bottomInset, isTablet ? 8 : 4),
    paddingTop: isTablet ? 8 : 6,
    height: tabBarHeight + bottomInset,
    display: hidden ? 'none' : 'flex',
  };
}
