import type { AssistantGuideKey, ReplyDialect, WritingUnderstandingScope } from '@shiren/shared';
import {
  parseWritingIntentResponse,
  writingIntentPromptForDialect,
} from '@shiren/shared';
import type { ModelClient } from './modelClient.js';

export type WritingIntentAnalysis = {
  mode: 'chat' | 'revise' | 'guide';
  referenceScope: WritingUnderstandingScope;
  displayText: string;
  action: string;
  instruction: string;
  ready: boolean;
  guide?: AssistantGuideKey;
};

function chapterUserPayload(input: {
  content: string;
  chapterTitle: string;
  chapterContent: string;
  documentExcerpt?: string;
  articleExcerpt?: string;
}): string {
  const chapterBlock = [
    input.chapterTitle ? `当前待改章节：${input.chapterTitle}` : '',
    `本章内容：\n${input.chapterContent?.trim() || input.articleExcerpt?.trim() || '（本章尚无正文）'}`,
  ]
    .filter(Boolean)
    .join('\n');

  const docBlock = input.documentExcerpt?.trim()
    ? `全篇文章节选（供理解意图；实际改稿仍只改上面这一章）：\n${input.documentExcerpt.trim()}`
    : '';

  return [chapterBlock, docBlock, `用户说：${input.content}`].filter(Boolean).join('\n\n');
}

export async function analyzeWritingIntentLocal(
  model: ModelClient,
  input: {
    content: string;
    chapterTitle: string;
    chapterContent: string;
    documentExcerpt?: string;
    articleExcerpt?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    dialect?: ReplyDialect | null;
  },
): Promise<WritingIntentAnalysis> {
  const historyMsgs = (input.history ?? []).slice(-12).map((m) => ({
    role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: m.content,
  }));

  const res = await model.complete({
    messages: [
      { role: 'system', content: writingIntentPromptForDialect(input.dialect) },
      ...historyMsgs,
      {
        role: 'user',
        content: chapterUserPayload(input),
      },
    ],
    temperature: 0.4,
  });

  const parsed = parseWritingIntentResponse(res.text);
  return {
    mode: parsed.mode,
    referenceScope: parsed.referenceScope,
    displayText: parsed.displayText,
    action: parsed.action,
    instruction: parsed.mode === 'revise' ? parsed.instruction || input.content : '',
    ready: parsed.ready,
    guide: parsed.guide,
  };
}

