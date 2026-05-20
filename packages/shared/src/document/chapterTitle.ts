/** 解析「第X章」+ 后缀，如「第一章童年」→ prefix=第一章, suffix=童年 */
export function parseChapterTitle(title: string): { prefix: string; suffix: string } {
  const trimmed = title.trim();
  const m = trimmed.match(/^(第(?:[一二三四五六七八九十]+|\d+)章)(.*)$/);
  if (m) return { prefix: m[1], suffix: m[2] ?? '' };
  return { prefix: '', suffix: trimmed };
}

export function buildChapterTitle(prefix: string, suffix: string): string {
  const s = suffix.trim();
  if (!prefix.trim()) return s || '未命名章节';
  return s ? `${prefix.trim()}${s}` : prefix.trim();
}
