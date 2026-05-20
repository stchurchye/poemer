/** 写作/意图 prompt 共用的篇章范围说明（独立文件，避免 persona ↔ writingIntent 循环依赖） */
export const WRITING_SCOPE_RULES = `文章与改稿范围（必须遵守）：
- 你会看到按章列出的整篇文章；默认评价、建议、改稿任务都只针对「当前待改章节」，其它章节仅作背景。
- 同一篇文章里，每次只能修改「当前待改章节」的正文，不能一次改多章；真正动笔改字时，只输出待改章节的替换正文。
- 若用户明确表示不要参考其它章节、只看本章、别管全篇，则 referenceScope 填 "chapter"；否则填 "document"。须根据整句话语义判断，禁止靠固定词表匹配。`;
//# sourceMappingURL=writingScopeRules.js.map