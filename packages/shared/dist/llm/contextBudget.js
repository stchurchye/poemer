/** 上下文 token 预算与组装（问答 / 写作小助手共用） */
/** 上下文分类展示顺序与配色（弹窗图例 / 分段条） */
export const CONTEXT_BREAKDOWN_META = [
    { key: 'system', labelZh: '系统提示词', color: '#9CA3AF' },
    { key: 'summary', labelZh: '压缩后的历史', color: '#F472B6' },
    { key: 'history', labelZh: '对话内容', color: '#60A5FA' },
    { key: 'document', labelZh: '文档内容', color: '#34D399' },
    { key: 'pendingUser', labelZh: '待发送', color: '#FBBF24' },
    { key: 'outputReserve', labelZh: '输出预留', color: '#6B7280' },
];
export const DEFAULT_CONTEXT_WINDOW_TOKENS = 300_000;
export const DEFAULT_OUTPUT_RESERVE_TOKENS = 8_000;
/** LLM 压缩后的摘要/全篇摘要写入上下文时的 token 上限 */
export const COMPACT_SUMMARY_MAX_TOKENS = 100_000;
export const COMPACT_THRESHOLD_RATIO = 0.8;
export const ESTIMATE_CHARS_PER_TOKEN = 1.6;
export const SUMMARY_PREFIX = '【此前对话摘要】\n';
export function getContextWindowTokens() {
    const raw = typeof process !== 'undefined' ? process.env.CONTEXT_WINDOW_TOKENS : undefined;
    const n = raw ? Number.parseInt(raw, 10) : DEFAULT_CONTEXT_WINDOW_TOKENS;
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_CONTEXT_WINDOW_TOKENS;
}
export function getOutputReserveTokens() {
    const raw = typeof process !== 'undefined' ? process.env.OUTPUT_RESERVE_TOKENS : undefined;
    const n = raw ? Number.parseInt(raw, 10) : DEFAULT_OUTPUT_RESERVE_TOKENS;
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_OUTPUT_RESERVE_TOKENS;
}
export function getCompactSummaryMaxTokens() {
    const raw = typeof process !== 'undefined' ? process.env.COMPACT_SUMMARY_MAX_TOKENS : undefined;
    const n = raw ? Number.parseInt(raw, 10) : COMPACT_SUMMARY_MAX_TOKENS;
    return Number.isFinite(n) && n > 0 ? n : COMPACT_SUMMARY_MAX_TOKENS;
}
/** 将摘要正文裁到 COMPACT_SUMMARY_MAX_TOKENS，再包上前缀 */
export function formatContextSummaryText(raw) {
    const trimmed = raw?.trim();
    if (!trimmed)
        return '';
    const body = trimTextToTokenBudget(trimmed, getCompactSummaryMaxTokens());
    return `${SUMMARY_PREFIX}${body}`;
}
export function estimateTokens(text) {
    if (!text)
        return 0;
    return Math.ceil(text.length / ESTIMATE_CHARS_PER_TOKEN);
}
export function formatTokenCount(n) {
    if (n >= 1000) {
        const k = n / 1000;
        return k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1).replace(/\.0$/, '')}k`;
    }
    return String(n);
}
export function tokensToEstimatedChars(tokens) {
    return Math.round(tokens * ESTIMATE_CHARS_PER_TOKEN);
}
export function formatCharCount(n) {
    if (n >= 10_000) {
        const wan = n / 10_000;
        return wan >= 10 ? `${Math.round(wan)}万` : `${wan.toFixed(1).replace(/\.0$/, '')}万`;
    }
    if (n >= 1000) {
        const k = n / 1000;
        return k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1).replace(/\.0$/, '')}k`;
    }
    return String(n);
}
export function getContextBreakdownSegments(breakdown) {
    return CONTEXT_BREAKDOWN_META.map((meta) => ({
        key: meta.key,
        tokens: breakdown[meta.key],
        labelZh: meta.labelZh,
        color: meta.color,
    })).filter((s) => s.tokens > 0);
}
/** 用户可见用量：不计「待发送」，用于圆环/详情占比 */
export function contextUsageForDisplay(usage) {
    const breakdown = {
        ...usage.breakdown,
        pendingUser: 0,
    };
    const usedTokens = breakdown.system +
        breakdown.summary +
        breakdown.history +
        breakdown.document +
        breakdown.outputReserve;
    return {
        ...usage,
        breakdown,
        usedTokens,
        ratio: usage.limitTokens > 0 ? Math.min(1, usedTokens / usage.limitTokens) : 0,
    };
}
/** 图例分段：不展示待发送 */
export function getContextBreakdownSegmentsForDisplay(breakdown) {
    return getContextBreakdownSegments(breakdown).filter((s) => s.key !== 'pendingUser');
}
function fitHistoryFromEnd(history, budgetTokens) {
    if (budgetTokens <= 0 || history.length === 0) {
        return { fitted: [], omitted: [...history], used: 0 };
    }
    const fittedRev = [];
    let used = 0;
    for (let i = history.length - 1; i >= 0; i--) {
        const turn = history[i];
        const cost = estimateTokens(turn.content);
        if (used + cost > budgetTokens && fittedRev.length > 0) {
            return {
                fitted: fittedRev.reverse(),
                omitted: history.slice(0, i + 1),
                used,
            };
        }
        if (used + cost > budgetTokens) {
            return { fitted: [], omitted: [...history], used: 0 };
        }
        fittedRev.push(turn);
        used += cost;
    }
    return { fitted: fittedRev.reverse(), omitted: [], used };
}
function buildUsage(limitTokens, breakdown, compacted, droppedVerbatimTurns) {
    const usedTokens = breakdown.system +
        breakdown.summary +
        breakdown.history +
        breakdown.document +
        breakdown.pendingUser +
        breakdown.outputReserve;
    return {
        usedTokens,
        limitTokens,
        ratio: Math.min(1, usedTokens / limitTokens),
        breakdown,
        compacted,
        droppedVerbatimTurns,
    };
}
export function assembleChatContext(params) {
    const limitTokens = params.limitTokens ?? getContextWindowTokens();
    const outputReserve = params.outputReserve ?? getOutputReserveTokens();
    const breakdown = {
        system: estimateTokens(params.systemPrompt),
        summary: 0,
        history: 0,
        document: 0,
        pendingUser: estimateTokens(params.pendingUser),
        outputReserve,
    };
    const summaryText = formatContextSummaryText(params.summary);
    breakdown.summary = estimateTokens(summaryText);
    const fixed = breakdown.system +
        breakdown.summary +
        breakdown.pendingUser +
        breakdown.outputReserve;
    const historyBudget = Math.max(0, limitTokens - fixed);
    const { fitted, omitted, used } = fitHistoryFromEnd(params.history, historyBudget);
    breakdown.history = used;
    const messages = [{ role: 'system', content: params.systemPrompt }];
    if (summaryText) {
        messages.push({ role: 'user', content: summaryText });
    }
    for (const turn of fitted) {
        messages.push(turn);
    }
    messages.push({ role: 'user', content: params.pendingUser });
    const needsCompact = omitted.length > 0;
    const usage = buildUsage(limitTokens, breakdown, Boolean(params.summary?.trim()) || needsCompact, omitted.length);
    return {
        messages,
        usage,
        needsCompact,
        messagesToCompact: omitted,
    };
}
export function assembleWritingIntentContext(params) {
    const limitTokens = params.limitTokens ?? getContextWindowTokens();
    const outputReserve = params.outputReserve ?? getOutputReserveTokens();
    const breakdown = {
        system: estimateTokens(params.systemPrompt),
        summary: 0,
        history: 0,
        document: estimateTokens(params.chapterBlock) + estimateTokens(params.documentBlock),
        pendingUser: estimateTokens(`用户说：${params.userMessage}`),
        outputReserve,
    };
    const summaryText = formatContextSummaryText(params.summary);
    breakdown.summary = estimateTokens(summaryText);
    let documentBlockForModel = params.documentBlock;
    const fixedWithoutDoc = breakdown.system +
        breakdown.summary +
        breakdown.pendingUser +
        breakdown.outputReserve;
    let historyBudget = Math.max(0, limitTokens - fixedWithoutDoc - breakdown.document);
    let { fitted, omitted, used } = fitHistoryFromEnd(params.history, historyBudget);
    if (omitted.length > 0 && params.documentBlock) {
        const docBudget = Math.max(600, limitTokens -
            fixedWithoutDoc -
            used -
            estimateTokens(params.chapterBlock) -
            breakdown.pendingUser -
            500);
        const prefix = '全篇文章节选（供理解意图；实际改稿仍只改上面这一章）：\n';
        documentBlockForModel = params.documentBlock.startsWith('全篇')
            ? trimTextToTokenBudget(params.documentBlock, docBudget)
            : trimTextToTokenBudget(`${prefix}${params.documentBlock}`, docBudget);
        breakdown.document =
            estimateTokens(params.chapterBlock) + estimateTokens(documentBlockForModel);
        historyBudget = Math.max(0, limitTokens - fixedWithoutDoc - breakdown.document - breakdown.pendingUser);
        const retry = fitHistoryFromEnd(params.history, historyBudget);
        fitted = retry.fitted;
        omitted = retry.omitted;
        used = retry.used;
    }
    breakdown.history = used;
    const finalUserContent = [
        params.chapterBlock,
        documentBlockForModel,
        `用户说：${params.userMessage}`,
    ]
        .filter(Boolean)
        .join('\n\n');
    const messages = [{ role: 'system', content: params.systemPrompt }];
    if (summaryText) {
        messages.push({ role: 'user', content: summaryText });
    }
    for (const turn of fitted) {
        messages.push(turn);
    }
    messages.push({ role: 'user', content: finalUserContent });
    breakdown.document =
        estimateTokens(params.chapterBlock) + estimateTokens(documentBlockForModel);
    const needsCompact = omitted.length > 0;
    const usage = buildUsage(limitTokens, breakdown, Boolean(params.summary?.trim()) || needsCompact, omitted.length);
    return {
        messages,
        usage,
        needsCompact,
        messagesToCompact: omitted,
        documentBlockForModel,
    };
}
export function assembleWritingExecuteContext(params) {
    const limitTokens = params.limitTokens ?? getContextWindowTokens();
    const outputReserve = params.outputReserve ?? getOutputReserveTokens();
    let userContent = params.userParts.filter(Boolean).join('\n\n');
    const systemTokens = estimateTokens(params.systemPrompt);
    const maxUser = limitTokens - systemTokens - outputReserve - 200;
    if (estimateTokens(userContent) > maxUser) {
        userContent = trimTextToTokenBudget(userContent, maxUser);
    }
    const userTokens = estimateTokens(userContent);
    const breakdown = {
        system: systemTokens,
        summary: 0,
        history: 0,
        document: userTokens,
        pendingUser: 0,
        outputReserve,
    };
    return {
        messages: [
            { role: 'system', content: params.systemPrompt },
            { role: 'user', content: userContent },
        ],
        usage: buildUsage(limitTokens, breakdown, false, 0),
        userContent,
    };
}
export function trimTextToTokenBudget(text, maxTokens) {
    if (maxTokens <= 0)
        return '';
    const maxChars = Math.floor(maxTokens * ESTIMATE_CHARS_PER_TOKEN);
    if (text.length <= maxChars)
        return text;
    return `${text.slice(0, maxChars)}\n…（下文已按上下文预算压缩）`;
}
export function shouldCompact(usage) {
    return usage.ratio >= COMPACT_THRESHOLD_RATIO || usage.droppedVerbatimTurns > 0;
}
//# sourceMappingURL=contextBudget.js.map