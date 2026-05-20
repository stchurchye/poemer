/** 加载等待正向计时文案，如 3秒、1分05秒 */
export function formatElapsedSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest > 0 ? `${m}分${rest}秒` : `${m}分`;
}
