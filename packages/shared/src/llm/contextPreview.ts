import { SUMMARY_PREFIX, estimateTokens } from './contextBudget.js';
import type {
  AssembleChatResult,
  AssembleWritingIntentResult,
  ContextChatMessage,
  ContextUsage,
} from './contextBudget.js';

export type ContextBlockKind =
  | 'system'
  | 'summary'
  | 'history_user'
  | 'history_assistant'
  | 'document_chapter'
  | 'document_excerpt'
  | 'pending_user';

export type ContextPreviewBlock = {
  id: string;
  kind: ContextBlockKind;
  label: string;
  content: string;
  tokens: number;
  selectable: boolean;
  selectedByDefault: boolean;
  messageId?: string;
  role?: 'user' | 'assistant';
  omittedByBudget?: boolean;
};

export type ContextPreview = {
  blocks: ContextPreviewBlock[];
  usage: ContextUsage;
  messages: ContextChatMessage[];
};

export type ContextSelection = {
  excludedBlockIds?: string[];
  excludedMessageIds?: string[];
  /** @deprecated 仅兼容旧客户端 */
  selectedMessageIds?: string[];
  /** @deprecated */
  selectedBlockIds?: string[];
};

export function usesExclusionMode(selection?: ContextSelection | null): boolean {
  if (!selection) return false;
  return (
    selection.excludedMessageIds !== undefined || selection.excludedBlockIds !== undefined
  );
}

export function contextSelectionWithServerMarks<T>(
  _allMessages: T[],
  contextSelection?: ContextSelection | null,
): ContextSelection | undefined {
  return contextSelection ?? undefined;
}

function blockId(prefix: string, index: number): string {
  return `${prefix}-${index}`;
}

export function formatMessagesAsMarkdown(messages: ContextChatMessage[]): string {
  return messages
    .map((m) => {
      const role =
        m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user';
      return `### ${role}\n\n${m.content}`;
    })
    .join('\n\n---\n\n');
}

export function exclusionFromBlocks(
  blocks: ContextPreviewBlock[],
  selectedBlockIds: string[],
): ContextSelection {
  const selected = new Set(selectedBlockIds);
  const excludedMessageIds: string[] = [];
  const excludedBlockIds: string[] = [];
  for (const b of blocks) {
    if (!b.selectable || b.omittedByBudget) continue;
    if (selected.has(b.id)) continue;
    if (b.messageId) excludedMessageIds.push(b.messageId);
    else excludedBlockIds.push(b.id);
  }
  return { excludedMessageIds, excludedBlockIds };
}

export function selectedBlockIdsFromExclusion(
  blocks: ContextPreviewBlock[],
  selection: ContextSelection,
): string[] {
  if (usesExclusionMode(selection)) {
    const excludedMsg = new Set(selection.excludedMessageIds ?? []);
    const excludedBlock = new Set(selection.excludedBlockIds ?? []);
    const ids: string[] = [];
    for (const b of blocks) {
      if (!b.selectable) {
        ids.push(b.id);
        continue;
      }
      if (b.omittedByBudget) continue;
      if (b.messageId && excludedMsg.has(b.messageId)) continue;
      if (excludedBlock.has(b.id)) continue;
      ids.push(b.id);
    }
    return ids;
  }
  if (selection.selectedBlockIds?.length) {
    return selection.selectedBlockIds;
  }
  return defaultSelectedBlockIds(blocks);
}

export function defaultSelectedBlockIds(blocks: ContextPreviewBlock[]): string[] {
  return blocks.filter((b) => b.selectedByDefault && !b.omittedByBudget).map((b) => b.id);
}

export function blocksFromAssembleChatResult(
  assembled: AssembleChatResult,
  opts?: {
    historyMessageIds?: string[];
    excludedMessageIds?: string[];
  },
): ContextPreview {
  const excludedMsg = new Set(opts?.excludedMessageIds ?? []);
  const useExclusion = opts?.excludedMessageIds !== undefined;
  const blocks: ContextPreviewBlock[] = [];
  let idx = 0;

  const systemMsg = assembled.messages.find((m) => m.role === 'system');
  if (systemMsg) {
    blocks.push({
      id: blockId('system', idx++),
      kind: 'system',
      label: '系统提示词',
      content: systemMsg.content,
      tokens: estimateTokens(systemMsg.content),
      selectable: false,
      selectedByDefault: true,
    });
  }

  const summaryMsg = assembled.messages.find(
    (m) => m.role === 'user' && m.content.startsWith(SUMMARY_PREFIX),
  );
  if (summaryMsg) {
    blocks.push({
      id: blockId('summary', idx++),
      kind: 'summary',
      label: '对话摘要',
      content: summaryMsg.content,
      tokens: estimateTokens(summaryMsg.content),
      selectable: true,
      selectedByDefault: true,
    });
  }

  let historyIdx = 0;
  for (const msg of assembled.messages) {
    if (msg.role === 'system') continue;
    if (msg.role === 'user' && msg.content.startsWith(SUMMARY_PREFIX)) continue;
    if (msg === assembled.messages[assembled.messages.length - 1]) continue;

    const messageId = opts?.historyMessageIds?.[historyIdx];
    const kind = msg.role === 'assistant' ? 'history_assistant' : 'history_user';
    blocks.push({
      id: blockId('history', idx++),
      kind,
      label: msg.role === 'assistant' ? `小助手 #${historyIdx + 1}` : `用户 #${historyIdx + 1}`,
      content: msg.content,
      tokens: estimateTokens(msg.content),
      selectable: true,
      selectedByDefault: useExclusion && messageId ? !excludedMsg.has(messageId) : true,
      messageId,
      role: msg.role,
    });
    historyIdx += 1;
  }

  for (const turn of assembled.messagesToCompact) {
    const kind = turn.role === 'assistant' ? 'history_assistant' : 'history_user';
    blocks.push({
      id: blockId('omitted', idx++),
      kind,
      label: turn.role === 'assistant' ? '小助手（已裁切）' : '用户（已裁切）',
      content: turn.content,
      tokens: estimateTokens(turn.content),
      selectable: true,
      selectedByDefault: false,
      omittedByBudget: true,
      role: turn.role,
    });
  }

  const pending = assembled.messages[assembled.messages.length - 1];
  if (pending?.role === 'user') {
    blocks.push({
      id: blockId('pending', idx++),
      kind: 'pending_user',
      label: '待发送',
      content: pending.content,
      tokens: estimateTokens(pending.content),
      selectable: false,
      selectedByDefault: true,
    });
  }

  return {
    blocks,
    usage: assembled.usage,
    messages: assembled.messages,
  };
}

export function blocksFromWritingIntent(
  assembled: AssembleWritingIntentResult,
  opts: {
    chapterBlock: string;
    documentBlock: string;
    historyMessageIds?: string[];
    excludedMessageIds?: string[];
    excludedBlockIds?: string[];
  },
): ContextPreview {
  const excludedMsg = new Set(opts.excludedMessageIds ?? []);
  const excludedBlock = new Set(opts.excludedBlockIds ?? []);
  const useMsgExclusion = opts.excludedMessageIds !== undefined;
  const useBlockExclusion = opts.excludedBlockIds !== undefined;
  const blocks: ContextPreviewBlock[] = [];
  let idx = 0;

  const systemMsg = assembled.messages.find((m) => m.role === 'system');
  if (systemMsg) {
    blocks.push({
      id: blockId('system', idx++),
      kind: 'system',
      label: '系统提示词',
      content: systemMsg.content,
      tokens: estimateTokens(systemMsg.content),
      selectable: false,
      selectedByDefault: true,
    });
  }

  const summaryMsg = assembled.messages.find(
    (m) => m.role === 'user' && m.content.startsWith(SUMMARY_PREFIX),
  );
  if (summaryMsg) {
    blocks.push({
      id: blockId('summary', idx++),
      kind: 'summary',
      label: '写作对话摘要',
      content: summaryMsg.content,
      tokens: estimateTokens(summaryMsg.content),
      selectable: true,
      selectedByDefault: true,
    });
  }

  if (opts.chapterBlock.trim()) {
    const chapterId = blockId('chapter', idx++);
    blocks.push({
      id: chapterId,
      kind: 'document_chapter',
      label: '当前段落',
      content: opts.chapterBlock,
      tokens: estimateTokens(opts.chapterBlock),
      selectable: true,
      selectedByDefault: useBlockExclusion ? !excludedBlock.has(chapterId) : true,
    });
  }

  if (opts.documentBlock.trim()) {
    const documentId = blockId('document', idx++);
    blocks.push({
      id: documentId,
      kind: 'document_excerpt',
      label: '全篇节选',
      content: opts.documentBlock,
      tokens: estimateTokens(opts.documentBlock),
      selectable: true,
      selectedByDefault: useBlockExclusion ? !excludedBlock.has(documentId) : true,
    });
  }

  let historyIdx = 0;
  for (const msg of assembled.messages) {
    if (msg.role === 'system') continue;
    if (msg.role === 'user' && msg.content.startsWith(SUMMARY_PREFIX)) continue;
    if (msg === assembled.messages[assembled.messages.length - 1]) continue;

    const kind = msg.role === 'assistant' ? 'history_assistant' : 'history_user';
    const messageId = opts.historyMessageIds?.[historyIdx];
    blocks.push({
      id: blockId('whist', idx++),
      kind,
      label: msg.role === 'assistant' ? `小助手 #${historyIdx + 1}` : `用户 #${historyIdx + 1}`,
      content: msg.content,
      tokens: estimateTokens(msg.content),
      selectable: true,
      selectedByDefault: useMsgExclusion && messageId ? !excludedMsg.has(messageId) : true,
      messageId,
      role: msg.role,
    });
    historyIdx += 1;
  }

  for (const turn of assembled.messagesToCompact) {
    const kind = turn.role === 'assistant' ? 'history_assistant' : 'history_user';
    blocks.push({
      id: blockId('womit', idx++),
      kind,
      label: turn.role === 'assistant' ? '小助手（已裁切）' : '用户（已裁切）',
      content: turn.content,
      tokens: estimateTokens(turn.content),
      selectable: true,
      selectedByDefault: false,
      omittedByBudget: true,
      role: turn.role,
    });
  }

  const pending = assembled.messages[assembled.messages.length - 1];
  if (pending?.role === 'user') {
    blocks.push({
      id: blockId('wpending', idx++),
      kind: 'pending_user',
      label: '待发送',
      content: pending.content,
      tokens: estimateTokens(pending.content),
      selectable: false,
      selectedByDefault: true,
    });
  }

  return {
    blocks,
    usage: assembled.usage,
    messages: assembled.messages,
  };
}

export function filterHistoryTurns<T extends { role: string; content: string; id?: string }>(
  history: T[],
  selection?: ContextSelection | null,
): T[] {
  if (!selection) return history;
  if (usesExclusionMode(selection)) {
    const excluded = new Set(selection.excludedMessageIds ?? []);
    return history.filter((h) => (h.id ? !excluded.has(h.id) : true));
  }
  if (selection.selectedMessageIds?.length) {
    const ids = new Set(selection.selectedMessageIds);
    return history.filter((h) => (h.id ? ids.has(h.id) : true));
  }
  return history;
}
