import type { ChatIntentAnalyzeResult, ChatMessage, ChatSession } from '@shiren/shared';
import {
  chatIntentPromptForDialect,
  formatChatIntentUserPayload,
  isAssistantGuideKey,
  parseWritingIntentResponse,
  type ReplyDialect,
} from '@shiren/shared';
import type { ModelClient } from './modelClient.js';

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
        content:
          '你是「写作小助手」，陪长辈聊天解惑。语气温柔、有耐心。全部用中文回复。',
      },
      ...history,
      { role: 'user', content: input.userText },
    ],
  });
  return res.text.trim();
}
