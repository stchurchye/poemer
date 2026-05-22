import type { AssistantGuideKey, ReplyDialect, WritingUnderstandingScope } from '@shiren/shared';
import {
  parseWritingIntentResponse,
  writingChatSystemPromptForDialect,
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

export async function generateWritingChatReplyLocal(
  model: ModelClient,
  input: {
    content: string;
    chapterTitle: string;
    chapterContent: string;
    documentExcerpt?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    dialect?: ReplyDialect | null;
  },
): Promise<string> {
  const history = (input.history ?? []).slice(-12).map((m) => ({
    role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: m.content,
  }));

  const chapterBlock = [
    input.chapterTitle ? `当前待改章节：${input.chapterTitle}` : '',
    `本章内容：\n${input.chapterContent?.trim() || '（本章尚无正文）'}`,
  ]
    .filter(Boolean)
    .join('\n');
  const docBlock = input.documentExcerpt?.trim()
    ? `全篇背景：\n${input.documentExcerpt.trim()}`
    : '';

  const res = await model.complete({
    messages: [
      { role: 'system', content: writingChatSystemPromptForDialect(input.dialect) },
      ...history,
      {
        role: 'user',
        content: [chapterBlock, docBlock, input.content].filter(Boolean).join('\n\n'),
      },
    ],
  });
  return res.text.trim();
}

export async function generateRevisionSnapshotLocal(
  model: ModelClient,
  input: { action: string; instruction: string; chapterContent: string },
): Promise<{ newText: string; comment: string }> {
  const res = await model.complete({
    messages: [
      {
        role: 'system',
        content:
          '你是写作小助手。根据用户要求修改正文，只输出修改后的正文，不要解释。',
      },
      {
        role: 'user',
        content: `动作：${input.action}\n要求：${input.instruction}\n正文：\n${input.chapterContent}`,
      },
    ],
  });
  return {
    newText: res.text.trim(),
    comment: '已根据您的要求改好，请看一看。',
  };
}
