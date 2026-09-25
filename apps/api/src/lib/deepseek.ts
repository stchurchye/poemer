import {
  chatPersonaForDialect,
  chatSessionTitlePromptForDialect,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL_PRO,
  writingIntentPromptForDialect,
  parseWritingIntentResponse,
  isAssistantGuideKey,
  type AssistantGuideKey,
  type ReplyDialect,
} from '@shiren/shared';
import {
  runWritingExecute,
  runWritingExecuteRetry,
  type ModelClient,
} from '@shiren/engine';

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

export type ChatCompletionResult = {
  text: string;
  finishReason?: string;
};

export async function chatCompletionResultRaw(
  apiKey: string,
  messages: ChatMessageInput[],
  options?: { maxTokens?: number; temperature?: number },
): Promise<ChatCompletionResult> {
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
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    const msg = json.error?.message ?? `DeepSeek 请求失败（${res.status}）`;
    throw new DeepSeekError(msg, res.status);
  }

  const choice = json.choices?.[0];
  const content = choice?.message?.content?.trim();
  if (!content) throw new DeepSeekError('小助手没有返回内容，请再试一次');
  return { text: content, finishReason: choice?.finish_reason };
}

export async function chatCompletionRaw(
  apiKey: string,
  messages: ChatMessageInput[],
  options?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  return (await chatCompletionResultRaw(apiKey, messages, options)).text;
}

function modelFromApiKey(apiKey: string): ModelClient {
  return {
    complete: (input) =>
      chatCompletionResultRaw(apiKey, input.messages as ChatMessageInput[], {
        maxTokens: input.maxTokens,
        temperature: input.temperature,
      }),
  };
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
  return runWritingExecute({
    model: modelFromApiKey(params.apiKey),
    action: params.action,
    oldText: params.oldText,
    instruction: params.instruction,
    styleGuide: params.styleGuide,
    dialect: params.dialect,
    chapterTitle: params.chapterTitle,
    understandingScope: params.understandingScope,
    documentExcerpt: params.documentExcerpt,
    modelId: DEEPSEEK_MODEL_PRO,
  });
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
  return runWritingExecuteRetry({
    model: modelFromApiKey(params.apiKey),
    action: params.action,
    oldText: params.oldText,
    baseInstruction: params.baseInstruction,
    previousSuggestion: params.previousSuggestion,
    additionalFeedback: params.additionalFeedback,
    priorFeedback: params.priorFeedback,
    styleGuide: params.styleGuide,
    dialect: params.dialect,
    modelId: DEEPSEEK_MODEL_PRO,
  });
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
