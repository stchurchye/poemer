import type { ChatIntentAnalyzeResult, ChatMessage, ChatSession } from '@shiren/shared';
import {
  chatIntentPromptForDialect,
  chatPersonaForDialect,
  chatSessionTitlePromptForDialect,
  formatChatIntentUserPayload,
  isAssistantGuideKey,
  parseWritingIntentResponse,
  type ReplyDialect,
} from '@shiren/shared';
import type { ModelTokenUsage } from '@shiren/shared';
import type { ModelClient, ModelStreamCallbacks } from './modelClient.js';

export type ChatEngineInput = {
  session: ChatSession;
  history: ChatMessage[];
  userText: string;
  dialect?: ReplyDialect | null;
};

function parseChatIntentJson(raw: string): {
  displayText: string;
  sendContent: string;
  ready: boolean;
  guide?: ChatIntentAnalyzeResult['guide'];
} {
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
      const fromJson = typeof j.displayText === 'string' ? j.displayText.trim() : '';
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

export async function analyzeChatIntentLocal(
  model: ModelClient,
  input: {
    content: string;
    source: 'text' | 'voice';
    history: ChatMessage[];
    dialect?: ReplyDialect | null;
  },
): Promise<ChatIntentAnalyzeResult> {
  const recent = input.history
    .slice(-4)
    .map((m) => `${m.role === 'user' ? '用户' : '小助手'}：${m.content.trim()}`);
  const messages = [
    { role: 'system' as const, content: chatIntentPromptForDialect(input.dialect) },
    {
      role: 'user' as const,
      content: formatChatIntentUserPayload({
        recentLines: recent,
        currentContent: input.content,
        source: input.source,
      }),
    },
  ];
  const res = await model.complete({ messages, temperature: 0.35, maxTokens: 1024 });
  const parsed = parseChatIntentJson(res.text);
  const lastUser = input.content.trim();
  return {
    displayText: parsed.displayText,
    sendContent: parsed.guide ? '' : parsed.sendContent || lastUser,
    ready: parsed.guide ? false : parsed.ready,
    guide: parsed.guide,
    transcript: input.source === 'voice' ? input.content : undefined,
    source: input.source,
  };
}

export async function completeChatMessages(
  model: ModelClient,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const res = await model.complete({ messages, ...options });
  return res.text.trim();
}

/**
 * 流式补全：model 支持 completeStream 则逐段 onDelta，否则降级为一次性 complete 后回调全文。
 * 返回累加全文（已 trim）+ usage。
 */
export async function streamChatMessages(
  model: ModelClient,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  cb: ModelStreamCallbacks,
  options?: { maxTokens?: number; temperature?: number },
): Promise<{ text: string; usage?: ModelTokenUsage }> {
  if (model.completeStream) {
    const res = await model.completeStream({ messages, ...options }, cb);
    return { text: res.text.trim(), usage: res.usage };
  }
  const res = await model.complete({ messages, ...options });
  const text = res.text.trim();
  if (text) cb.onDelta(text);
  return { text, usage: res.usage };
}

export async function generateChatReply(
  model: ModelClient,
  input: ChatEngineInput,
): Promise<string> {
  const history = input.history.slice(-12).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const res = await model.complete({
    messages: [
      {
        role: 'system',
        content: chatPersonaForDialect(input.dialect),
      },
      ...history,
      { role: 'user', content: input.userText },
    ],
  });
  return res.text.trim();
}

function sanitizeChatSessionTitle(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/^["'「『【\s]+|["'」』】\s]+$/g, '')
    .replace(/[。．.!！?？…]+$/g, '')
    .trim()
    .slice(0, 32);
  return cleaned || fallback;
}

/** 根据最近上下文为问答话题起名 */
export async function summarizeChatSessionTitleLocal(
  model: ModelClient,
  params: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    lastUserMessage: string;
    dialect?: ReplyDialect | null;
  },
): Promise<string> {
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

  const res = await model.complete({
    messages: [
      { role: 'system', content: chatSessionTitlePromptForDialect(params.dialect) },
      {
        role: 'user',
        content: `最近对话：\n${transcript}\n\n用户最后一次提问：${params.lastUserMessage.trim()}\n\n请输出话题标题：`,
      },
    ],
    maxTokens: 48,
    temperature: 0.2,
  });

  return sanitizeChatSessionTitle(res.text, fallback || '和小助手聊聊');
}
