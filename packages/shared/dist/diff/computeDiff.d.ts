import type { DiffSegment } from '../types.js';
/**
 * 简易字符级 diff，用于增删对比展示。
 * 生产环境可替换为 diff-match-patch。
 */
export declare function computeDiff(oldText: string, newText: string): DiffSegment[];
export declare function diffSummary(segments: DiffSegment[]): string;
//# sourceMappingURL=computeDiff.d.ts.map