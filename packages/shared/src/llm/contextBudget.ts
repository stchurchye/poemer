/** 上下文 token 预算与组装（问答 / 写作小助手共用） */

import { getModelProfile } from './modelProfile.js';

export type ContextChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ContextUsageBreakdown = {
  system: number;
  summary: number;
  history: number;
  document: number;
  pendingUser: number;
  outputReserve: number;
};

export type ContextBreakdownKey = keyof ContextUsageBreakdown;

export type ContextBreakdownMeta = {
  key: ContextBreakdownKey;
  labelZh: string;
  color: string;
};

/** 上下文分类展示顺序与配色（弹窗图例 / 分段条） */
export const CONTEXT_BREAKDOWN_META: readonly ContextBreakdownMeta[] = [
  { key: 'system', labelZh: '系统提示词', color: '#9CA3AF' },
  { key: 'summary', labelZh: '压缩后的历史', color: '#F472B6' },
  { key: 'history', labelZh: '对话内容', color: '#60A5FA' },
  { key: 'document', labelZh: '文档内容', color: '#34D399' },
  { key: 'pendingUser', labelZh: '待发送', color: '#FBBF24' },
  { key: 'outputReserve', labelZh: '输出预留', color: '#6B7280' },
] as const;

export type ContextUsage = {
  usedTokens: number;
  limitTokens: number;
  ratio: number;
  breakdown: ContextUsageBreakdown;
  compacted: boolean;
  droppedVerbatimTurns: number;
};

/**
 * 兜底窗口：仅当无法解析模型 profile 时使用。真实窗口按模型走 getModelProfile()。
 * 取保守值（不再是乐观的 300k），避免未知模型下乐观放行导致上游超限。
 */
export const DEFAULT_CONTEXT_WINDOW_TOKENS = 272_000;
export const DEFAULT_OUTPUT_RESERVE_TOKENS = 8_000;
/** LLM 压缩后的摘要/全篇摘要写入上下文时的裁剪上限（有界，非 completion 上限） */
export const COMPACT_SUMMARY_MAX_TOKENS = 8_000;
/** 压缩 completion 的默认 maxTokens（会再被模型真实输出上限 clamp）。用户偏好取高一点。 */
export const DEFAULT_COMPACT_COMPLETION_MAX_TOKENS = 16_384;
export const COMPACT_THRESHOLD_RATIO = 0.9;
/** 兼容旧逻辑的字符换算系数（tokensToEstimatedChars / 展示用）；真实计量见 estimateTokens */
export const ESTIMATE_CHARS_PER_TOKEN = 1.6;

/** 语言感知计量：CJK 每字约 0.75 token（比旧 0.625 保守）；其它字符约 0.25 token（≈4 字符/token） */
export const CJK_TOKENS_PER_CHAR = 0.75;
export const OTHER_TOKENS_PER_CHAR = 0.25;

export const SUMMARY_PREFIX = '【此前对话摘要】\n';

const TRIM_NOTE = '\n…（下文已按上下文预算压缩）';

function envInt(name: string): number | undefined {
  const raw = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** 上下文窗口：按模型真实窗口；env 覆盖仅作运维口子（RN 无 process.env 时自然走 profile） */
export function getContextWindowTokens(modelId?: string | null): number {
  return envInt('CONTEXT_WINDOW_TOKENS') ?? getModelProfile(modelId).contextWindowTokens;
}

export function getOutputReserveTokens(): number {
  return envInt('OUTPUT_RESERVE_TOKENS') ?? DEFAULT_OUTPUT_RESERVE_TOKENS;
}

/** 摘要写入上下文时的裁剪上限（字数上限），与 completion maxTokens 是两个独立量 */
export function getCompactSummaryMaxTokens(): number {
  return envInt('COMPACT_SUMMARY_MAX_TOKENS') ?? COMPACT_SUMMARY_MAX_TOKENS;
}

/**
 * 压缩调用（model.complete）的 maxTokens：受模型真实单次输出上限约束。
 * 修 B1：绝不把 getCompactSummaryMaxTokens()（大值）当作 completion maxTokens 透传给上游。
 */
export function getCompactCompletionMaxTokens(modelId?: string | null): number {
  const configured = envInt('COMPACT_COMPLETION_MAX_TOKENS') ?? DEFAULT_COMPACT_COMPLETION_MAX_TOKENS;
  const modelCap = getModelProfile(modelId).maxCompletionTokens;
  return Math.min(configured, modelCap);
}

/** 将摘要正文裁到 COMPACT_SUMMARY_MAX_TOKENS，再包上前缀 */
export function formatContextSummaryText(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return '';
  const body = trimTextToTokenBudget(trimmed, getCompactSummaryMaxTokens());
  return `${SUMMARY_PREFIX}${body}`;
}

/** CJK（含中日韩统一表意、假名、谚文、全角标点）判定，用于分语言估算 */
function isCjkCharCode(code: number): boolean {
  return (
    (code >= 0x3400 && code <= 0x9fff) || // CJK 统一表意 + 扩展A
    (code >= 0xf900 && code <= 0xfaff) || // 兼容表意
    (code >= 0x3040 && code <= 0x30ff) || // 平/片假名
    (code >= 0xac00 && code <= 0xd7af) || // 谚文
    (code >= 0xff00 && code <= 0xffef) // 全角字符/标点
  );
}

/**
 * 语言感知 token 估算（修 B4）：中文按 ~0.75 token/字（比旧 chars/1.6=0.625 保守，防静默溢出），
 * 其它字符按 ~0.25 token/字。整套预算/触发/裁切都建于此。
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (let i = 0; i < text.length; i++) {
    if (isCjkCharCode(text.charCodeAt(i))) cjk++;
    else other++;
  }
  return Math.ceil(cjk * CJK_TOKENS_PER_CHAR + other * OTHER_TOKENS_PER_CHAR);
}

export function formatTokenCount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(n);
}

export function tokensToEstimatedChars(tokens: number): number {
  return Math.round(tokens * ESTIMATE_CHARS_PER_TOKEN);
}

export function formatCharCount(n: number): string {
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

export function getContextBreakdownSegments(
  breakdown: ContextUsageBreakdown,
): { key: ContextBreakdownKey; tokens: number; labelZh: string; color: string }[] {
  return CONTEXT_BREAKDOWN_META.map((meta) => ({
    key: meta.key,
    tokens: breakdown[meta.key],
    labelZh: meta.labelZh,
    color: meta.color,
  })).filter((s) => s.tokens > 0);
}

/** 用户可见用量：不计「待发送」，用于圆环/详情占比 */
export function contextUsageForDisplay(usage: ContextUsage): ContextUsage {
  const breakdown: ContextUsageBreakdown = {
    ...usage.breakdown,
    pendingUser: 0,
  };
  const usedTokens =
    breakdown.system +
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
export function getContextBreakdownSegmentsForDisplay(
  breakdown: ContextUsageBreakdown,
): { key: ContextBreakdownKey; tokens: number; labelZh: string; color: string }[] {
  return getContextBreakdownSegments(breakdown).filter((s) => s.key !== 'pendingUser');
}

type HistoryTurn = { role: 'user' | 'assistant'; content: string };

function fitHistoryFromEnd(
  history: HistoryTurn[],
  budgetTokens: number,
): { fitted: HistoryTurn[]; omitted: HistoryTurn[]; used: number } {
  if (budgetTokens <= 0 || history.length === 0) {
    return { fitted: [], omitted: [...history], used: 0 };
  }
  let cut = history.length; // fitted = history.slice(cut)
  let used = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const cost = estimateTokens(history[i].content);
    if (used + cost > budgetTokens && cut < history.length) break;
    if (used + cost > budgetTokens) {
      // 单条就超预算：一条都放不下
      return { fitted: [], omitted: [...history], used: 0 };
    }
    used += cost;
    cut = i;
  }
  // C-Dedup：逐字历史不以孤立 assistant 开头，成对丢弃避免拆散 user/assistant
  if (cut < history.length && history[cut].role === 'assistant') {
    used -= estimateTokens(history[cut].content);
    cut += 1;
  }
  return {
    fitted: history.slice(cut),
    omitted: history.slice(0, cut),
    used,
  };
}

function buildUsage(
  limitTokens: number,
  breakdown: ContextUsageBreakdown,
  compacted: boolean,
  droppedVerbatimTurns: number,
): ContextUsage {
  const usedTokens =
    breakdown.system +
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

export type AssembleChatResult = {
  messages: ContextChatMessage[];
  usage: ContextUsage;
  needsCompact: boolean;
  messagesToCompact: HistoryTurn[];
};

export function assembleChatContext(params: {
  systemPrompt: string;
  summary?: string | null;
  history: HistoryTurn[];
  pendingUser: string;
  limitTokens?: number;
  outputReserve?: number;
  modelId?: string | null;
}): AssembleChatResult {
  const limitTokens = params.limitTokens ?? getContextWindowTokens(params.modelId);
  const outputReserve = params.outputReserve ?? getOutputReserveTokens();

  const breakdown: ContextUsageBreakdown = {
    system: estimateTokens(params.systemPrompt),
    summary: 0,
    history: 0,
    document: 0,
    pendingUser: estimateTokens(params.pendingUser),
    outputReserve,
  };

  const summaryText = formatContextSummaryText(params.summary);
  breakdown.summary = estimateTokens(summaryText);

  const fixed =
    breakdown.system +
    breakdown.summary +
    breakdown.pendingUser +
    breakdown.outputReserve;
  const historyBudget = Math.max(0, limitTokens - fixed);

  const { fitted, omitted, used } = fitHistoryFromEnd(params.history, historyBudget);
  breakdown.history = used;

  const messages: ContextChatMessage[] = [{ role: 'system', content: params.systemPrompt }];
  if (summaryText) {
    messages.push({ role: 'user', content: summaryText });
  }
  for (const turn of fitted) {
    messages.push(turn);
  }
  messages.push({ role: 'user', content: params.pendingUser });

  const needsCompact = omitted.length > 0;
  const usage = buildUsage(
    limitTokens,
    breakdown,
    Boolean(params.summary?.trim()) || needsCompact,
    omitted.length,
  );

  return {
    messages,
    usage,
    needsCompact,
    messagesToCompact: omitted,
  };
}

export type AssembleWritingIntentResult = {
  messages: ContextChatMessage[];
  usage: ContextUsage;
  needsCompact: boolean;
  messagesToCompact: HistoryTurn[];
  documentBlockForModel: string;
};

export function assembleWritingIntentContext(params: {
  systemPrompt: string;
  summary?: string | null;
  history: HistoryTurn[];
  chapterBlock: string;
  documentBlock: string;
  userMessage: string;
  limitTokens?: number;
  outputReserve?: number;
  modelId?: string | null;
}): AssembleWritingIntentResult {
  const limitTokens = params.limitTokens ?? getContextWindowTokens(params.modelId);
  const outputReserve = params.outputReserve ?? getOutputReserveTokens();

  const breakdown: ContextUsageBreakdown = {
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
  const fixedWithoutDoc =
    breakdown.system +
    breakdown.summary +
    breakdown.pendingUser +
    breakdown.outputReserve;

  let historyBudget = Math.max(0, limitTokens - fixedWithoutDoc - breakdown.document);
  let { fitted, omitted, used } = fitHistoryFromEnd(params.history, historyBudget);

  if (omitted.length > 0 && params.documentBlock) {
    // fixedWithoutDoc 已含 pendingUser，这里不再单独扣（修 C-Dedup：pendingUser 只计一次）
    const docBudget = Math.max(
      600,
      limitTokens - fixedWithoutDoc - used - estimateTokens(params.chapterBlock) - 500,
    );
    const prefix = '全篇文章节选（供理解意图；实际改稿仍只改上面这一章）：\n';
    documentBlockForModel = params.documentBlock.startsWith('全篇')
      ? trimTextToTokenBudget(params.documentBlock, docBudget)
      : trimTextToTokenBudget(`${prefix}${params.documentBlock}`, docBudget);
    breakdown.document =
      estimateTokens(params.chapterBlock) + estimateTokens(documentBlockForModel);
    historyBudget = Math.max(0, limitTokens - fixedWithoutDoc - breakdown.document);
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

  const messages: ContextChatMessage[] = [{ role: 'system', content: params.systemPrompt }];
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
  const usage = buildUsage(
    limitTokens,
    breakdown,
    Boolean(params.summary?.trim()) || needsCompact,
    omitted.length,
  );

  return {
    messages,
    usage,
    needsCompact,
    messagesToCompact: omitted,
    documentBlockForModel,
  };
}

export function assembleWritingExecuteContext(params: {
  systemPrompt: string;
  /** 不可截断段（用户指令、风格、范围说明、章标题）——始终 100% 送达 */
  pinnedParts?: string[];
  /** 可截断段（本章正文、全篇节选）——超预算时优先在这里裁 */
  trimmableParts?: string[];
  limitTokens?: number;
  outputReserve?: number;
  modelId?: string | null;
}): { messages: ContextChatMessage[]; usage: ContextUsage; userContent: string } {
  const limitTokens = params.limitTokens ?? getContextWindowTokens(params.modelId);
  const outputReserve = params.outputReserve ?? getOutputReserveTokens();

  const systemTokens = estimateTokens(params.systemPrompt);
  const maxUser = Math.max(0, limitTokens - systemTokens - outputReserve - 200);

  // 修 C2：pinned 段（尤其用户指令）永不被截；只在 trimmable 段（本章正文/全篇节选）里裁
  const pinnedText = (params.pinnedParts ?? []).filter(Boolean).join('\n\n');
  const pinnedTokens = estimateTokens(pinnedText);
  const trimBudget = Math.max(0, maxUser - pinnedTokens);
  let trimmableText = (params.trimmableParts ?? []).filter(Boolean).join('\n\n');
  if (estimateTokens(trimmableText) > trimBudget) {
    trimmableText = trimTextToTokenBudget(trimmableText, trimBudget);
  }
  // 指令类 pinned 段置前（模型先看到「要做什么」），再给可截断的正文/节选
  const userContent = [pinnedText, trimmableText].filter(Boolean).join('\n\n');

  const userTokens = estimateTokens(userContent);
  const breakdown: ContextUsageBreakdown = {
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

/**
 * 按 token 预算裁剪文本，裁剪结果（含压缩提示尾注）严格 <= maxTokens。
 * 与语言感知的 estimateTokens 一致（二分找最长前缀），中文也不会因固定系数而超预算。
 */
export function trimTextToTokenBudget(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return '';
  if (estimateTokens(text) <= maxTokens) return text;
  const noteTokens = estimateTokens(TRIM_NOTE);
  const budgetForBody = maxTokens - noteTokens;
  if (budgetForBody <= 0) {
    // 预算太小连尾注都放不下：退化为纯前缀硬截，仍保证 <= maxTokens
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (estimateTokens(text.slice(0, mid)) <= maxTokens) lo = mid;
      else hi = mid - 1;
    }
    return text.slice(0, lo);
  }
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (estimateTokens(text.slice(0, mid)) <= budgetForBody) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}${TRIM_NOTE}`;
}

export function shouldCompact(usage: ContextUsage): boolean {
  return usage.ratio >= COMPACT_THRESHOLD_RATIO || usage.droppedVerbatimTurns > 0;
}
