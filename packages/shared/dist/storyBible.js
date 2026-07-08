export const STORY_BIBLE_CATEGORY_LABELS = {
    character: '人物',
    term: '称呼/词条',
    timeline: '时间线',
    style: '风格',
};
const CATEGORY_ORDER = ['character', 'term', 'timeline', 'style'];
const VALID_CATEGORIES = new Set(CATEGORY_ORDER);
/** 设定卡条目硬上限：不只靠提示词自律，防幻觉/失控模型注入超大常驻块 */
export const MAX_STORY_BIBLE_ENTRIES = 30;
/** 常驻块前缀；含「以正文为准」告示，避免抽错的设定强行左右改稿 */
export const STORY_BIBLE_BLOCK_PREFIX = '【本文设定卡（请保持前后一致；若与正文冲突，一律以正文为准，不要据此改动正文事实）】';
/** 归一化 label 用于去重（去空白、大小写无关） */
function normalizeLabel(label) {
    return label.trim().toLowerCase();
}
function entryKey(category, label) {
    return `${category}:${normalizeLabel(label)}`;
}
/** 由 category+label 生成稳定 id（同一条目多次抽取 id 不变，天然幂等去重） */
function stableId(category, label) {
    return `sb-${entryKey(category, label)}`;
}
/** 把设定卡格式化成写作上下文里的常驻块；空则返回空串 */
export function formatStoryBibleForLlm(bible) {
    const entries = bible?.entries?.filter((e) => e?.label?.trim() && e?.note?.trim());
    if (!entries || entries.length === 0)
        return '';
    const byCategory = new Map();
    for (const e of entries) {
        const list = byCategory.get(e.category) ?? [];
        list.push(e);
        byCategory.set(e.category, list);
    }
    const lines = [STORY_BIBLE_BLOCK_PREFIX];
    for (const category of CATEGORY_ORDER) {
        const list = byCategory.get(category);
        if (!list || list.length === 0)
            continue;
        for (const e of list) {
            lines.push(`· ${STORY_BIBLE_CATEGORY_LABELS[category]} · ${e.label.trim()}：${e.note.trim()}`);
        }
    }
    return lines.join('\n');
}
/** 合并设定卡：同 label 用新 note 覆盖、新 label 追加，稳定去重 */
export function mergeStoryBible(existing, incoming) {
    const map = new Map();
    for (const e of existing?.entries ?? []) {
        if (!e?.label?.trim())
            continue;
        map.set(entryKey(e.category, e.label), {
            ...e,
            id: stableId(e.category, e.label),
        });
    }
    for (const e of incoming.entries) {
        if (!e?.label?.trim() || !e?.note?.trim())
            continue;
        map.set(entryKey(e.category, e.label), {
            id: stableId(e.category, e.label),
            category: e.category,
            label: e.label.trim(),
            note: e.note.trim(),
        });
    }
    return { entries: [...map.values()].slice(0, MAX_STORY_BIBLE_ENTRIES) };
}
/** 从模型输出里解析设定卡条目（宽松找 JSON 数组），非法/缺字段的丢弃，绝不抛错 */
export function parseStoryBibleEntries(raw) {
    const arr = extractJsonArray(raw);
    if (!arr)
        return [];
    const out = [];
    for (const item of arr.slice(0, MAX_STORY_BIBLE_ENTRIES * 2)) {
        if (!item || typeof item !== 'object')
            continue;
        const category = item.category;
        const label = item.label;
        const note = item.note;
        if (typeof category !== 'string' || !VALID_CATEGORIES.has(category))
            continue;
        if (typeof label !== 'string' || !label.trim())
            continue;
        if (typeof note !== 'string' || !note.trim())
            continue;
        const cat = category;
        out.push({
            id: stableId(cat, label),
            category: cat,
            label: label.trim(),
            note: note.trim(),
        });
    }
    return out;
}
/**
 * 从模型输出里稳健地取出设定卡 JSON 数组。
 * 修 review#10：不再用 indexOf('[')..lastIndexOf(']')（散文里的杂散 '['/']'，如引用 [1]、
 * markdown 列表项，会错切导致整段解析失败）。改为括号匹配扫描每个 '[' 起的平衡数组，
 * 偏向「含对象元素最多」的那个（真正的设定卡数组），忽略 [1]、[示例] 这类杂散小数组。
 */
function extractJsonArray(raw) {
    let best = null;
    for (let i = 0; i < raw.length; i++) {
        if (raw[i] !== '[')
            continue;
        const end = matchBalancedArrayEnd(raw, i);
        if (end < 0)
            continue;
        try {
            const parsed = JSON.parse(raw.slice(i, end + 1));
            if (Array.isArray(parsed)) {
                const objCount = parsed.filter((x) => x && typeof x === 'object').length;
                if (objCount > 0 && (!best || objCount > best.objCount)) {
                    best = { arr: parsed, objCount };
                }
                i = end; // 跳过整个数组，避免对嵌套元素重复扫描
            }
        }
        catch {
            /* 这个 '[' 不是合法数组起点，继续找下一个 */
        }
    }
    return best ? best.arr : null;
}
/** 从 start 处的 '[' 找到平衡的 ']'（跳过字符串内的括号）；找不到返回 -1 */
function matchBalancedArrayEnd(raw, start) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < raw.length; i++) {
        const c = raw[i];
        if (inStr) {
            if (esc)
                esc = false;
            else if (c === '\\')
                esc = true;
            else if (c === '"')
                inStr = false;
            continue;
        }
        if (c === '"')
            inStr = true;
        else if (c === '[' || c === '{')
            depth++;
        else if (c === ']' || c === '}') {
            depth--;
            if (depth === 0)
                return c === ']' ? i : -1;
            if (depth < 0)
                return -1;
        }
    }
    return -1;
}
//# sourceMappingURL=storyBible.js.map