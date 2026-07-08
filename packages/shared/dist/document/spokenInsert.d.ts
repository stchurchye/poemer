/**
 * 语音口述插入正文的纯决策：给定现有正文、光标、是否聚焦过、识别到的文字，
 * 算出插入后的正文与新光标位置。抽成纯函数以便单测(RN 组件里不好测)。
 *
 * 规则:没聚焦过且光标仍在开头 {0,0} → 追加到末尾(符合「刚打开这章就说话」的预期);
 * 否则按当前光标位置插入(不覆盖选区,取选区起点)。
 */
export type SpokenInsertPlan = {
    content: string;
    caret: number;
};
export declare function planSpokenInsert(params: {
    existing: string;
    text: string;
    selectionStart: number;
    selectionEnd: number;
    focused: boolean;
}): SpokenInsertPlan | null;
//# sourceMappingURL=spokenInsert.d.ts.map