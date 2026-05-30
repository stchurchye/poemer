import type { ColorPalette } from './colors';

/** 圆角、触控等布局令牌（字号见 colors.typography，响应式见 useLayout） */
export const radius = {
  sm: 10,
  md: 14,
  pill: 22,
} as const;

export const touch = {
  min: 48,
  comfort: 52,
} as const;

export function shadowFor(colors: ColorPalette) {
  return {
    color: colors.background === '#121212' ? '#000000' : '#0a0a14',
  } as const;
}
