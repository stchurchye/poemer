/** 按序号生成章节标题：第一章、第二章 … 第10章起用阿拉伯数字 */
export function formatChapterTitle(index: number): string {
  const n = index + 1;
  const cn = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (n >= 1 && n <= 10) return `第${cn[n - 1]}章`;
  return `第${n}章`;
}
