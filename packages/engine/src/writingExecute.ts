import {
  ACTION_PROMPTS,
  assembleWritingExecuteContext,
  ensureWritingExecuteBasis,
  estimateTokens,
  getContextWindowTokens,
  getOutputReserveTokens,
  hasWritingExecuteBasis,
  parseWritingExecuteResponse,
  trimTextToTokenBudgetTail,
  WRITING_EXECUTE_BASIS_ONLY_PROMPT,
  WRITING_EXECUTE_OUTPUT_RULES,
  WRITING_RETRY_PROMPT,
  writingDoneComment,
  writingPersonaForDialect,
  writingRetryDoneComment,
  type ContextUsage,
  type ReplyDialect,
  type WritingExecuteBasis,
} from '@shiren/shared';
import { prepareWritingExecuteContext } from './contextPipeline.js';
import type { ModelClient } from './modelClient.js';

export type WritingExecuteFallbackParams = {
  action: string;
  oldText: string;
  suggestedText: string;
  instruction?: string;
  dialect?: ReplyDialect;
};

export async function completeWritingExecute(
  model: ModelClient,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  fallback: WritingExecuteFallbackParams,
  options?: { maxTokens?: number; temperature?: number },
): Promise<{ text: string; basis: WritingExecuteBasis }> {
  const res = await model.complete({ messages, ...options });
  let { text, basis } = parseWritingExecuteResponse(res.text);

  if (hasWritingExecuteBasis(basis)) {
    return { text, basis: basis! };
  }

  const filled = await fetchWritingExecuteBasisOnly(model, {
    ...fallback,
    suggestedText: text || fallback.suggestedText,
  });
  return { text, basis: filled };
}

async function fetchWritingExecuteBasisOnly(
  model: ModelClient,
  params: WritingExecuteFallbackParams,
): Promise<WritingExecuteBasis> {
  const userParts = [
    `改稿方式：${params.action}`,
    params.instruction?.trim() ? `用户要求：${params.instruction.trim()}` : '',
    `原文：\n${params.oldText || '（空）'}`,
    `改稿后正文：\n${params.suggestedText || '（空）'}`,
  ].filter(Boolean);

  const res = await model.complete({
    messages: [
      {
        role: 'system',
        content: `${writingPersonaForDialect(params.dialect)}\n\n${WRITING_EXECUTE_BASIS_ONLY_PROMPT}`,
      },
      { role: 'user', content: userParts.join('\n\n') },
    ],
    temperature: 0.35,
    maxTokens: 512,
  });

  const parsed = parseWritingExecuteResponse(res.text);
  if (hasWritingExecuteBasis(parsed.basis)) {
    return parsed.basis!;
  }

  return {
    evaluation: '原文写得有感情，也有可以写得更清楚、更顺口的地方。',
    rationale: `已按「${params.action}」的要求改了一版，方便您对比看看是否合适。`,
  };
}

export async function runWritingExecute(params: {
  model: ModelClient;
  action: string;
  oldText: string;
  instruction?: string;
  styleGuide?: string;
  dialect?: ReplyDialect;
  chapterTitle?: string;
  understandingScope?: 'chapter' | 'document';
  documentExcerpt?: string;
  documentContextSummary?: string | null;
}): Promise<{
  text: string;
  comment: string;
  basis: WritingExecuteBasis;
  contextUsage: ContextUsage;
}> {
  const { messages, usage } = prepareWritingExecuteContext({
    action: params.action,
    oldText: params.oldText,
    instruction: params.instruction,
    styleGuide: params.styleGuide,
    dialect: params.dialect,
    chapterTitle: params.chapterTitle,
    understandingScope: params.understandingScope,
    documentExcerpt: params.documentExcerpt,
    documentContextSummary: params.documentContextSummary,
  });

  const parsed = await completeWritingExecute(params.model, messages, {
    action: params.action,
    oldText: params.oldText,
    suggestedText: params.oldText,
    instruction: params.instruction,
    dialect: params.dialect,
  });

  const isContinue = params.action === '续写';
  const text = isContinue ? params.oldText + parsed.text : parsed.text;

  return {
    text,
    comment: writingDoneComment(params.action, params.dialect),
    basis: ensureWritingExecuteBasis(parsed.basis, params.action),
    contextUsage: usage,
  };
}

export async function runWritingExecuteRetry(params: {
  model: ModelClient;
  action: string;
  oldText: string;
  baseInstruction: string;
  previousSuggestion: string;
  additionalFeedback: string;
  priorFeedback?: string[];
  styleGuide?: string;
  dialect?: ReplyDialect;
  limitTokens?: number;
  outputReserve?: number;
  modelId?: string | null;
}): Promise<{ text: string; comment: string; basis: WritingExecuteBasis }> {
  const actionPrompt = ACTION_PROMPTS[params.action] ?? ACTION_PROMPTS['润色'];
  const isContinue = params.action === '续写';

  const system = `${writingPersonaForDialect(params.dialect)}

${actionPrompt}

${WRITING_RETRY_PROMPT}
${isContinue ? '- 续写任务：在上一版改稿末尾继续写，只输出新增段落' : ''}

${WRITING_EXECUTE_OUTPUT_RULES}`;

  const priorLines = (params.priorFeedback ?? [])
    .filter((line) => line.trim())
    .map((line, i) => `${i + 1}. ${line.trim()}`)
    .join('\n');

  // 修 C1：重试也走预算截断。用户本轮意见/初次要求/风格是 pinned（永不截）；
  // 原文、上一版改稿、历次意见是 trimmable（长文多轮时优先在这里裁），避免顶爆窗口。
  const basePinned = [
    params.styleGuide ? `写作风格：${params.styleGuide}` : '',
    params.baseInstruction.trim()
      ? `初次改稿要求：\n${params.baseInstruction.trim()}`
      : '',
    `用户本轮补充意见：\n${params.additionalFeedback.trim()}`,
  ].filter(Boolean);

  let pinnedParts: string[];
  let trimmableParts: string[];
  if (isContinue) {
    // 修 review#4：续写要接着「上一版改稿」的【末尾】写。trimmable 走保头裁尾会把续写点裁没，
    // 故把上一版作为续写基准裁头留尾后 pin 住（assemble 不再动它）；原文与之高度冗余，丢弃。
    const limit = params.limitTokens ?? getContextWindowTokens(params.modelId);
    const reserve = params.outputReserve ?? getOutputReserveTokens();
    const overhead =
      estimateTokens(system) + estimateTokens(basePinned.join('\n\n')) + estimateTokens(priorLines);
    const contBudget = Math.max(500, limit - reserve - overhead - 300);
    const base = trimTextToTokenBudgetTail(params.previousSuggestion, contBudget);
    pinnedParts = [...basePinned, `小助手上一版改稿（请从它的末尾继续写）：\n${base}`];
    trimmableParts = [priorLines ? `历次补充意见：\n${priorLines}` : ''].filter(Boolean);
  } else {
    pinnedParts = basePinned;
    trimmableParts = [
      `原文：\n${params.oldText || '（空）'}`,
      `小助手上一版改稿：\n${params.previousSuggestion}`,
      priorLines ? `历次补充意见：\n${priorLines}` : '',
    ].filter(Boolean);
  }

  const { messages } = assembleWritingExecuteContext({
    systemPrompt: system,
    pinnedParts,
    trimmableParts,
    limitTokens: params.limitTokens,
    outputReserve: params.outputReserve,
    modelId: params.modelId,
  });

  const parsed = await completeWritingExecute(
    params.model,
    messages,
    {
      action: params.action,
      oldText: params.oldText,
      suggestedText: params.previousSuggestion,
      instruction: params.additionalFeedback,
      dialect: params.dialect,
    },
  );

  const text = isContinue ? params.oldText + parsed.text : parsed.text;
  return {
    text,
    comment: writingRetryDoneComment(params.dialect),
    basis: ensureWritingExecuteBasis(parsed.basis, params.action),
  };
}
