/**
 * 票B:外部 Markdown/纯文本 → 导入计划(纯函数,UI 层拿计划去建文档)。
 * 规则:首行 `# 标题` 作文档名并剥除;`## ` 二级标题切章(前言归「开篇」);
 * 无 ## 则单章(title '' = 让 store 用默认章名);超 MAX 章合并进末章不丢内容。
 */

export type MarkdownImportPlan = {
  title: string;
  chapters: Array<{ title: string; content: string }>;
};

/** 与 createLocalStore 的 MAX_CHAPTERS 同口径(shared 不 import store,常量各自声明+测试钉住)。 */
const MAX_IMPORT_CHAPTERS = 50;

function stripExt(name: string): string {
  return name.replace(/\.(md|markdown|txt)$/i, '').trim();
}

export function planMarkdownImport(fileName: string, raw: string): MarkdownImportPlan {
  const normalized = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  let body = normalized;

  // 文档名:首个非空行若是一级标题则采用并剥除;否则文件名去扩展名。
  let title = '';
  const lines = body.split('\n');
  const firstIdx = lines.findIndex((l) => l.trim().length > 0);
  if (firstIdx >= 0) {
    const m = /^#\s+(.+)$/.exec(lines[firstIdx].trim());
    if (m) {
      title = m[1].trim();
      lines.splice(firstIdx, 1);
      body = lines.join('\n');
    }
  }
  if (!title) title = stripExt(fileName) || '导入文稿';

  // 切章:^## 标题
  const sections: Array<{ title: string; content: string }> = [];
  const chapterRe = /^##\s+(.+)$/gm;
  const matches = [...body.matchAll(chapterRe)];
  if (matches.length === 0) {
    return { title, chapters: [{ title: '', content: body.trim() }] };
  }
  const preamble = body.slice(0, matches[0].index).trim();
  if (preamble) sections.push({ title: '开篇', content: preamble });
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index! + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : body.length;
    sections.push({ title: matches[i][1].trim(), content: body.slice(start, end).trim() });
  }
  // 超上限:溢出段落原样(含 ## 标题行)并进末章,导入绝不丢内容。
  if (sections.length > MAX_IMPORT_CHAPTERS) {
    const kept = sections.slice(0, MAX_IMPORT_CHAPTERS - 1);
    const overflow = sections
      .slice(MAX_IMPORT_CHAPTERS - 1)
      .map((s) => `## ${s.title}\n${s.content}`)
      .join('\n\n');
    kept.push({ title: sections[MAX_IMPORT_CHAPTERS - 1].title, content: overflow });
    return { title, chapters: kept };
  }
  return { title, chapters: sections };
}
