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

export const shadow = {
  color: '#0a0a14',
} as const;

export { colors, typography } from './colors';
