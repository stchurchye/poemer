import {
  chatPersonaForDialect,
  chatSessionTitlePromptForDialect,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL_PRO,
  writingPersonaForDialect,
  writingIntentPromptForDialect,
  writingDoneComment,
  writingRetryDoneComment,
  WRITING_RETRY_PROMPT,
  WRITING_EXECUTE_OUTPUT_RULES,
  parseWritingIntentResponse,
  isAssistantGuideKey,
  ACTION_PROMPTS,
  type AssistantGuideKey,
  type ReplyDialect,
} from '@shiren/shared';
import { completeWritingExecuteRaw } from './writingExecuteCompletion.js';

export type ChatMessageInput = { role: 'system' | 'user' | 'assistant'; content: string };

export class DeepSeekError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'DeepSeekError';
  }
}

function resolveApiKey(headerKey?: string | null): string | null {
  const fromHeader = headerKey?.trim();
  if (fromHeader) return fromHeader;
  const fromEnv = process.env.DEEPSEEK_API_KEY?.trim();
  return fromEnv || null;
}

export function getApiKeyFromRequest(headerKey?: string | null): string {
  const key = resolveApiKey(headerKey);
  if (!key) {
    throw new DeepSeekError('API_KEY_MISSING');
  }
  return key;
}

export function hasApiKeyConfigured(headerKey?: string | null): boolean {
  return Boolean(resolveApiKey(headerKey));
}

export async function chatCompletionRaw(
  apiKey: string,
  messages: ChatMessageInput[],
  options?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL_PRO,
      messages,
      stream: false,
      max_tokens: options?.maxTokens ?? 2048,
      temperature: options?.temperature ?? 0.7,
    }),
  });

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    const msg = json.error?.message ?? `DeepSeek 请求失败（${res.status}）`;
    throw new DeepSeekError(msg, res.status);
  }

  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new DeepSeekError('小助手没有返回内容，请再试一次');
  return content;
}

/** 验证密钥是否可用 */
export async function verifyDeepSeekKey(apiKey: string): Promise<boolean> {
  await chatCompletionRaw(
    apiKey,
    [
      { role: 'system', content: '你是助手。' },
      { role: 'user', content: '请只回复：好的' },
    ],
    { maxTokens: 16, temperature: 0 },
  );
  return true;
}

/** 写作：续写 / 润色等 */
export async function deepseekWriting(params: {
  apiKey: string;
  action: string;
  oldText: string;
  instruction?: string;
  styleGuide?: string;
  dialect?: ReplyDialect;
  chapterTitle?: string;
  understandingScope?: 'chapter' | 'document';
  documentExcerpt?: string;
}): Promise<{
  text: string;
  comment: string;
  basis: import('@shiren/shared').WritingExecuteBasis;
}> {
  const actionPrompt = ACTION_PROMPTS[params.action] ?? ACTION_PROMPTS['润色'];
  const isContinue = params.action === '续写';
  const useFullDoc = params.understandingScope === 'document';

  const system = `${writingPersonaForDialect(params.dialect)}

${actionPrompt}

要求：
- 每次只能修改「待改本章」的正文；其它章节仅供理解上下文，不得改写或输出其它章节内容。
${isContinue ? '- 只输出需要续写的新增段落，不要重复原文，不要加标题或说明' : '- 只输出修改后的完整段落正文，不要加标题、引号或解释'}
- 不要使用 markdown 格式

${WRITING_EXECUTE_OUTPUT_RULES}`;

  const userParts = [
    params.styleGuide ? `写作风格：${params.styleGuide}` : '',
    params.chapterTitle ? `待改本章：${params.chapterTitle}` : '',
    useFullDoc
      ? '理解范围：可参考下方全篇节选理解上下文，但输出只能替换待改本章正文。'
      : '理解范围：仅根据待改本章正文理解，不要引用其它章节内容来改写。',
    `待改本章正文：\n${params.oldText || '（空）'}`,
    useFullDoc && params.documentExcerpt?.trim()
      ? `全篇节选（仅供理解，勿改其它章）：\n${params.documentExcerpt.trim()}`
      : '',
    params.instruction ? `用户补充：${params.instruction}` : '',
  ].filter(Boolean);

  const { text: body, basis } = await completeWritingExecuteRaw(
    params.apiKey,
    [
      { role: 'system', content: system },
      { role: 'user', content: userParts.join('\n\n') },
    ],
    {
      action: params.action,
      oldText: params.oldText,
      suggestedText: params.oldText,
      instruction: params.instruction,
      dialect: params.dialect,
    },
  );

  const merged = isContinue ? params.oldText + body : body;
  const comment = writingDoneComment(params.action, params.dialect);

  return {
    text: merged,
    comment,
    basis,
  };
}

/** 再改一版：保留初次要求 + 上一版改稿 + 历次/本轮补充意见 */
export async function deepseekWritingRetry(params: {
  apiKey: string;
  action: string;
  oldText: string;
  baseInstruction: string;
  previousSuggestion: string;
  additionalFeedback: string;
  priorFeedback?: string[];
  styleGuide?: string;
  dialect?: ReplyDialect;
}): Promise<{
  text: string;
  comment: string;
  basis: import('@shiren/shared').WritingExecuteBasis;
}> {
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

  const userParts = [
    params.styleGuide ? `写作风格：${params.styleGuide}` : '',
    `原文：\n${params.oldText || '（空）'}`,
    params.baseInstruction.trim()
      ? `初次改稿要求：\n${params.baseInstruction.trim()}`
      : '',
    `小助手上一版改稿：\n${params.previousSuggestion}`,
    priorLines ? `历次补充意见：\n${priorLines}` : '',
    `用户本轮补充意见：\n${params.additionalFeedback.trim()}`,
  ].filter(Boolean);

  const { text: body, basis } = await completeWritingExecuteRaw(
    params.apiKey,
    [
      { role: 'system', content: system },
      { role: 'user', content: userParts.join('\n\n') },
    ],
    {
      action: params.action,
      oldText: params.oldText,
      suggestedText: params.previousSuggestion,
      instruction: params.baseInstruction,
      dialect: params.dialect,
    },
  );

  const merged = isContinue ? params.previousSuggestion + body : body;
  return {
    text: merged,
    comment: writingRetryDoneComment(params.dialect),
    basis,
  };
}

export type WritingIntentResult = {
  mode: 'chat' | 'revise' | 'guide';
  referenceScope: 'chapter' | 'document';
  displayText: string;
  action: string;
  instruction: string;
  ready: boolean;
  guide?: AssistantGuideKey;
};

export type ChatIntentResult = {
  displayText: string;
  sendContent: string;
  ready: boolean;
  guide?: AssistantGuideKey;
};

function parseChatIntentJson(raw: string): ChatIntentResult {
  const writingParsed = parseWritingIntentResponse(raw);
  if (writingParsed.mode === 'guide' && writingParsed.guide) {
    return {
      displayText: writingParsed.displayText,
      sendContent: '',
      ready: false,
      guide: writingParsed.guide,
    };
  }

  const line = raw
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('{') && l.endsWith('}'));
  if (!line) {
    return { displayText: raw.trim(), sendContent: '', ready: false };
  }
  const displayText = raw.replace(line, '').trim();
  try {
    const j = JSON.parse(line) as {
      sendContent?: string;
      ready?: boolean;
      guide?: string;
      displayText?: string;
    };
    const guide = isAssistantGuideKey(j.guide) ? j.guide : undefined;
    if (guide) {
      const fromJson =
        typeof j.displayText === 'string' ? j.displayText.trim() : '';
      return {
        displayText: fromJson || displayText || raw.trim(),
        sendContent: '',
        ready: false,
        guide,
      };
    }
    return {
      displayText: displayText || raw.trim(),
      sendContent: j.sendContent?.trim() ?? '',
      ready: Boolean(j.ready),
    };
  } catch {
    return { displayText: raw.trim(), sendContent: '', ready: false };
  }
}

/** 写作侧栏：理解改稿意图并生成确认话术 */
export async function deepseekWritingIntent(params: {
  apiKey: string;
  userMessage: string;
  articleExcerpt?: string;
  chapterTitle?: string;
  chapterContent?: string;
  documentExcerpt?: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  dialect?: ReplyDialect;
}): Promise<WritingIntentResult> {
  const chapterBlock = [
    params.chapterTitle ? `当前待改章节：${params.chapterTitle}` : '',
    `本章内容：\n${params.chapterContent?.trim() || params.articleExcerpt?.trim() || '（本章尚无正文）'}`,
  ]
    .filter(Boolean)
    .join('\n');

  const docBlock = params.documentExcerpt?.trim()
    ? `全篇文章节选（供理解意图；实际改稿仍只改上面这一章）：\n${params.documentExcerpt.trim()}`
    : '';

  const messages: ChatMessageInput[] = [
    { role: 'system', content: writingIntentPromptForDialect(params.dialect) },
    ...params.history.slice(-12),
    {
      role: 'user',
      content: [chapterBlock, docBlock, `用户说：${params.userMessage}`].filter(Boolean).join('\n\n'),
    },
  ];
  const raw = await chatCompletionRaw(params.apiKey, messages, { temperature: 0.4 });
  const parsed = parseWritingIntentResponse(raw);
  return {
    mode: parsed.mode,
    referenceScope: parsed.referenceScope,
    displayText: parsed.displayText,
    action: parsed.action,
    instruction: parsed.mode === 'revise' ? parsed.instruction || params.userMessage : '',
    ready: parsed.ready,
    guide: parsed.guide,
  };
}

export function parseReplyDialect(header?: string | null): ReplyDialect {
  return header?.trim().toLowerCase() === 'cantonese' ? 'cantonese' : 'mandarin';
}

function sanitizeChatSessionTitle(raw: string, fallback: string): string {
  const line = raw
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return fallback;
  const cleaned = line
    .replace(/^["'「『【]|["'」』】]$/g, '')
    .replace(/[。．.!！?？…]+$/g, '')
    .trim()
    .slice(0, 32);
  return cleaned || fallback;
}

/** 根据最近上下文为问答话题起名（突出最后一次用户提问） */
export async function summarizeChatSessionTitle(params: {
  apiKey: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  lastUserMessage: string;
  dialect?: ReplyDialect;
}): Promise<string> {
  const fallback = params.lastUserMessage.trim().replace(/\s+/g, ' ').slice(0, 28);
  const recent = params.messages.slice(-10);
  if (recent.length === 0) {
    return fallback || '和小助手聊聊';
  }

  const transcript = recent
    .map((m) => {
      const label = m.role === 'user' ? '用户' : '小助手';
      const text = m.content.trim().replace(/\s+/g, ' ');
      return `${label}：${text.slice(0, 400)}`;
    })
    .join('\n');

  const raw = await chatCompletionRaw(
    params.apiKey,
    [
      { role: 'system', content: chatSessionTitlePromptForDialect(params.dialect) },
      {
        role: 'user',
        content: `最近对话：\n${transcript}\n\n用户最后一次提问：${params.lastUserMessage.trim()}\n\n请输出话题标题：`,
      },
    ],
    { maxTokens: 48, temperature: 0.2 },
  );

  return sanitizeChatSessionTitle(raw, fallback || '和小助手聊聊');
}

/** 问答（使用已组装的 messages，含摘要 + 最近轮） */
export async function deepseekChatFromMessages(
  apiKey: string,
  messages: ChatMessageInput[],
): Promise<string> {
  return chatCompletionRaw(apiKey, messages);
}

/** @deprecated 请用 prepareChatContext + deepseekChatFromMessages */
export async function deepseekChat(params: {
  apiKey: string;
  history: ChatMessageInput[];
  userMessage: string;
  dialect?: ReplyDialect;
}): Promise<string> {
  const messages: ChatMessageInput[] = [
    { role: 'system', content: chatPersonaForDialect(params.dialect) },
    ...params.history.filter((m) => m.role !== 'system'),
    { role: 'user', content: params.userMessage },
  ];
  return chatCompletionRaw(params.apiKey, messages);
}

/** 写作意图（使用已组装的 messages） */
export async function deepseekWritingIntentFromMessages(
  apiKey: string,
  messages: ChatMessageInput[],
): Promise<WritingIntentResult> {
  const raw = await chatCompletionRaw(apiKey, messages, { temperature: 0.4 });
  const parsed = parseWritingIntentResponse(raw);
  const lastUser =
    [...messages].reverse().find((m) => m.role === 'user')?.content?.trim() ?? '';
  return {
    mode: parsed.mode,
    referenceScope: parsed.referenceScope,
    displayText: parsed.displayText,
    action: parsed.action,
    instruction: parsed.mode === 'revise' ? parsed.instruction || lastUser : '',
    ready: parsed.ready,
    guide: parsed.guide,
  };
}

/** 写作侧栏：对话回复（使用已组装的 messages） */
export async function deepseekWritingChatFromMessages(
  apiKey: string,
  messages: ChatMessageInput[],
): Promise<string> {
  return chatCompletionRaw(apiKey, messages);
}

/** 小助手：整理发送前意图（使用已组装的 messages） */
export async function deepseekChatIntentFromMessages(
  apiKey: string,
  messages: ChatMessageInput[],
): Promise<ChatIntentResult> {
  const raw = await chatCompletionRaw(apiKey, messages, { temperature: 0.35, maxTokens: 1024 });
  const parsed = parseChatIntentJson(raw);
  const lastUser =
    [...messages].reverse().find((m) => m.role === 'user')?.content?.trim() ?? '';
  return {
    displayText: parsed.displayText,
    sendContent: parsed.guide ? '' : parsed.sendContent || lastUser,
    ready: parsed.guide ? false : parsed.ready,
    guide: parsed.guide,
  };
}
