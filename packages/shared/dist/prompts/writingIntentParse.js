import { isAssistantGuideKey } from './assistantGuideRegistry.js';
function parseMode(value) {
    if (value === 'guide')
        return 'guide';
    return value === 'revise' ? 'revise' : 'chat';
}
function parseReferenceScope(value) {
    return value === 'chapter' ? 'chapter' : 'document';
}
function tryParseJsonObject(text) {
    const trimmed = text.trim();
    if (!trimmed.startsWith('{'))
        return null;
    try {
        const j = JSON.parse(trimmed);
        return typeof j === 'object' && j !== null ? j : null;
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
function looksLikeIntentJson(j) {
    return (j.mode !== undefined ||
        j.ready !== undefined ||
        j.action !== undefined ||
        j.instruction !== undefined ||
        j.guide !== undefined);
}
function mapIntent(j, prose) {
    const mode = parseMode(j.mode);
    const referenceScope = parseReferenceScope(j.referenceScope);
    const displayFromJson = typeof j.displayText === 'string' ? j.displayText.trim() : '';
    const displayText = displayFromJson || prose.trim();
    const guide = isAssistantGuideKey(j.guide) ? j.guide : undefined;
    if (mode === 'guide' && guide) {
        return {
            mode: 'guide',
            referenceScope,
            displayText: displayFromJson,
            action: '',
            instruction: '',
            ready: Boolean(j.ready),
            guide,
        };
    }
    if (guide && mode !== 'revise') {
        return {
            mode: 'guide',
            referenceScope,
            displayText: displayFromJson,
            action: '',
            instruction: '',
            ready: true,
            guide,
        };
    }
    if (mode === 'chat') {
        return {
            mode: 'chat',
            referenceScope,
            displayText,
            action: '',
            instruction: '',
            ready: Boolean(j.ready),
        };
    }
    return {
        mode: 'revise',
        referenceScope,
        displayText,
        action: typeof j.action === 'string' ? j.action.trim() || '润色' : '润色',
        instruction: typeof j.instruction === 'string' ? j.instruction.trim() : '',
        ready: Boolean(j.ready),
    };
}
/** 解析意图模型输出（支持正文 + 单行或多行 JSON） */
export function parseWritingIntentResponse(raw) {
    const trimmed = raw.trim();
    if (!trimmed) {
        return {
            mode: 'chat',
            referenceScope: 'document',
            displayText: '',
            action: '',
            instruction: '',
            ready: false,
        };
    }
    const lines = trimmed.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line.startsWith('{'))
            continue;
        const j = tryParseJsonObject(line);
        if (j && looksLikeIntentJson(j)) {
            return mapIntent(j, lines.slice(0, i).join('\n').trim());
        }
    }
    const lastBrace = trimmed.lastIndexOf('{');
    if (lastBrace >= 0) {
        const j = tryParseJsonObject(trimmed.slice(lastBrace));
        if (j && looksLikeIntentJson(j)) {
            return mapIntent(j, trimmed.slice(0, lastBrace).trim());
        }
    }
    return {
        mode: 'chat',
        referenceScope: 'document',
        displayText: trimmed,
        action: '',
        instruction: '',
        ready: false,
    };
}
/** 气泡展示用：去掉尾部 JSON，只保留确认话术 */
export function stripWritingIntentDisplayText(content) {
    return parseWritingIntentResponse(content).displayText;
}
//# sourceMappingURL=writingIntentParse.js.map