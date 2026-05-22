import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useFontPreferences } from './FontPreferencesContext';
import {
  DEFAULT_FONT_SIZE_PRESET,
  resolveFontMetrics,
  type FontChannel,
  type FontMetrics,
} from './fontPresets';

/** 宽度 ≥ 768 视为 iPad / 平板布局 */
export const TABLET_MIN_WIDTH = 768;

/** 黄金比例 φ，用于写作页左右分栏 */
export const GOLDEN_RATIO = 1.61803398875;

export type WindowLayout = {
  width: number;
  height: number;
  isTablet: boolean;
  contentMaxWidth: number;
  chatMaxWidth: number;
  pageMaxWidth: number;
  horizontalPadding: number;
  tabBarHeight: number;
};

export type LayoutMetrics = WindowLayout & FontMetrics;

function useWindowLayout(): WindowLayout {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isTablet = width >= TABLET_MIN_WIDTH;
    return {
      width,
      height,
      isTablet,
      contentMaxWidth: isTablet ? 720 : width,
      chatMaxWidth: isTablet ? 960 : width,
      pageMaxWidth: isTablet ? 1100 : width,
      horizontalPadding: isTablet ? 28 : 16,
      tabBarHeight: isTablet ? 64 : 52,
    };
  }, [width, height]);
}

/** 文章 / 对话正文字号（随设置页双档缩放） */
export function useTypography(channel: FontChannel): LayoutMetrics {
  const window = useWindowLayout();
  const { articlePreset, dialogPreset } = useFontPreferences();
  const preset = channel === 'article' ? articlePreset : dialogPreset;

  return useMemo(
    () => ({
      ...window,
      ...resolveFontMetrics(preset, window.isTablet),
    }),
    [window, preset],
  );
}

/**
 * 壳层布局：Tab、设置页、文稿库等固定用「大」档，不随用户字号设置变化。
 */
export function useLayout(): LayoutMetrics {
  const window = useWindowLayout();

  return useMemo(
    () => ({
      ...window,
      ...resolveFontMetrics(DEFAULT_FONT_SIZE_PRESET, window.isTablet),
    }),
    [window],
  );
}
