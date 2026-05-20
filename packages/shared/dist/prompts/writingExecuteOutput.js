/** 改稿执行阶段：要求模型在正文后附评价与改稿理由 JSON */
export const WRITING_EXECUTE_OUTPUT_RULES = `【输出格式（必须遵守，缺一视为未完成）】
1. 先输出改稿后的正文（续写任务只输出需要新增的一段，不重复原文）。
2. 正文结束后，必须另起一行输出且仅输出一行 JSON（不要代码块、不要 markdown、不要换行缩进）：
{"evaluation":"…","rationale":"…"}
3. evaluation、rationale 均必填，各 1～3 句；evaluation 是对文章本身的评价；rationale 说明为什么这样改，不要复述用户原话。
4. 禁止在正文里写「评价」「说明」等标题；评价与理由只能出现在最后一行 JSON 里。
5. 若未输出符合要求的 JSON，本次回答视为无效。`;
/** 正文已生成、仅补改稿依据时的追問 */
export const WRITING_EXECUTE_BASIS_ONLY_PROMPT = `用户改稿已完成，你只需补充「改稿依据」。
请只输出一行 JSON（不要其它文字、不要代码块）：
{"evaluation":"1～3句：肯定原文优点并简评可改之处","rationale":"1～3句：说明本次改稿思路与主要变动"}
evaluation、rationale 均必填，不得为空。`;
function tryParseBasisJson(text) {
    const trimmed = text.trim();
    if (!trimmed.startsWith('{'))
        return null;
    try {
        return JSON.parse(trimmed);
    }
    catch {
        const start = trimmed.indexOf('{');
        if (start < 0)
            return null;
        let depth = 0;
        for (let i = start; i < trimmed.length; i++) {
            if (trimmed[i] === '{')
                depth++;
            else if (trimmed[i] === '}') {
                depth--;
                if (depth === 0) {
                    try {
                        return JSON.parse(trimmed.slice(start, i + 1));
                    }
                    catch {
                        return null;
                    }
                }
            }
        }
        return null;
    }
}
function basisFromJson(j) {
    const evaluation = j.evaluation?.trim() ?? '';
    const rationale = j.rationale?.trim() ?? '';
    if (!evaluation && !rationale)
        return null;
    return { evaluation, rationale };
}
export function hasWritingExecuteBasis(basis) {
    return Boolean(basis?.evaluation?.trim() || basis?.rationale?.trim());
}
/** 保证写入 revision / 消息时一定有可展示的改稿依据 */
export function ensureWritingExecuteBasis(basis, action) {
    const evaluation = basis?.evaluation?.trim() ?? '';
    const rationale = basis?.rationale?.trim() ?? '';
    if (evaluation && rationale) {
        return { evaluation, rationale };
    }
    return {
        evaluation: evaluation ||
            '原文有真切感受，也有可以写得更顺口、更清楚的地方。',
        rationale: rationale ||
            `已按「${action}」完成改稿，方便您对比是否合适。`,
    };
}
/** 从改稿模型输出中拆出正文与改稿依据 JSON */
export function parseWritingExecuteResponse(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return { text: '', basis: null };
    const lines = trimmed.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line.startsWith('{'))
            continue;
        const j = tryParseBasisJson(line);
        if (!j)
            continue;
        const basis = basisFromJson(j);
        if (!basis)
            continue;
        return { text: lines.slice(0, i).join('\n').trim(), basis };
    }
    const lastBrace = trimmed.lastIndexOf('{');
    if (lastBrace >= 0) {
        const j = tryParseBasisJson(trimmed.slice(lastBrace));
        if (j) {
            const basis = basisFromJson(j);
            if (basis) {
                return { text: trimmed.slice(0, lastBrace).trim(), basis };
            }
        }
    }
    const whole = tryParseBasisJson(trimmed);
    if (whole) {
        const basis = basisFromJson(whole);
        if (basis)
            return { text: '', basis };
    }
    return { text: trimmed, basis: null };
}
//# sourceMappingURL=writingExecuteOutput.js.map