/**
 * 票B:外部 Markdown/纯文本 → 导入计划(纯函数,UI 层拿计划去建文档)。
 * 规则:首行 `# 标题` 作文档名并剥除;`## ` 二级标题切章(前言归「开篇」);
 * 无 ## 则单章(title '' = 让 store 用默认章名);超 MAX 章合并进末章不丢内容。
 */
export type MarkdownImportPlan = {
    title: string;
    chapters: Array<{
        title: string;
        content: string;
    }>;
};
export declare function planMarkdownImport(fileName: string, raw: string): MarkdownImportPlan;
//# sourceMappingURL=importMarkdown.d.ts.map