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
function extractJsonArray(raw) {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start < 0 || end <= start)
        return null;
    try {
        const parsed = JSON.parse(raw.slice(start, end + 1));
        return Array.isArray(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=storyBible.js.map