export function planSpokenInsert(params) {
    const text = params.text.trim();
    if (!text)
        return null;
    const { existing } = params;
    const useAppend = !params.focused && params.selectionStart === 0 && params.selectionEnd === 0;
    if (useAppend) {
        const sep = existing.length && !existing.endsWith('\n') ? '\n\n' : '';
        const content = existing + sep + text;
        return { content, caret: content.length };
    }
    const rawOffset = Math.min(params.selectionStart, params.selectionEnd);
    const offset = Math.max(0, Math.min(rawOffset, existing.length));
    const content = existing.slice(0, offset) + text + existing.slice(offset);
    return { content, caret: offset + text.length };
}
//# sourceMappingURL=spokenInsert.js.map