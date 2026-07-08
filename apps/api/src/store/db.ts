import { randomUUID } from 'crypto';
import type {
  Block,
  Chapter,
  ChatMessage,
  ChatSession,
  Document,
  Revision,
  StoryBible,
  WritingAssistantMessage,
} from '@shiren/shared';
import { formatChapterTitle } from '@shiren/shared';
import { loadPersistedStore, savePersistedStore } from './persist.js';

const documents = new Map<string, Document>();
const revisions = new Map<string, Revision>();
const chatSessions = new Map<string, ChatSession>();
const chatMessages = new Map<string, ChatMessage[]>();
const writingAssistantMessages = new Map<string, WritingAssistantMessage[]>();

function now() {
  return new Date().toISOString();
}

function persist() {
  savePersistedStore({
    documents: [...documents.values()],
    revisions: [...revisions.values()],
    chatSessions: [...chatSessions.values()],
    chatMessages: Object.fromEntries(chatMessages.entries()),
    writingAssistantMessages: Object.fromEntries(writingAssistantMessages.entries()),
  });
}

/** 启动时从本地 JSON 恢复（避免 dev 重启丢数据） */
export function hydrateStore(): void {
  const data = loadPersistedStore();
  if (!data) return;
  documents.clear();
  revisions.clear();
  chatSessions.clear();
  chatMessages.clear();
  writingAssistantMessages.clear();
  for (const doc of data.documents) documents.set(doc.id, doc);
  for (const rev of data.revisions) revisions.set(rev.id, rev);
  for (const s of data.chatSessions) chatSessions.set(s.id, s);
  for (const [id, msgs] of Object.entries(data.chatMessages ?? {})) {
    chatMessages.set(id, msgs);
  }
  for (const [id, msgs] of Object.entries(data.writingAssistantMessages ?? {})) {
    writingAssistantMessages.set(id, msgs);
  }
}

function emptyChapter(order: number, title: string): Chapter {
  const blockId = randomUUID();
  return {
    id: randomUUID(),
    title,
    order,
    chapterSummary: '',
    blocks: [
      {
        id: blockId,
        content: '',
        currentRevisionId: null,
      },
    ],
  };
}

export function createDocument(title: string): Document {
  const id = randomUUID();
  const ts = now();
  const doc: Document = {
    id,
    title,
    chapters: [emptyChapter(0, formatChapterTitle(0))],
    globalSummary: '',
    styleGuide: '',
    currentRevisionId: null,
    revisionCount: 0,
    updatedAt: ts,
    createdAt: ts,
    hiddenAt: null,
  };
  documents.set(id, doc);
  persist();
  return doc;
}

export function listDocuments(): Document[] {
  return [...documents.values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getDocument(id: string): Document | undefined {
  return documents.get(id);
}

export function updateDocument(id: string, patch: Partial<Document>): Document | undefined {
  const doc = documents.get(id);
  if (!doc) return undefined;
  const updated = { ...doc, ...patch, updatedAt: now() };
  documents.set(id, updated);
  persist();
  return updated;
}

export function saveDocumentContent(
  documentId: string,
  chapterId: string,
  blockId: string,
  content: string,
): Document | undefined {
  const doc = documents.get(documentId);
  if (!doc) return undefined;
  const chapters = doc.chapters.map((ch) => {
    if (ch.id !== chapterId) return ch;
    return {
      ...ch,
      blocks: ch.blocks.map((b) => (b.id === blockId ? { ...b, content } : b)),
    };
  });
  return updateDocument(documentId, { chapters });
}

const MAX_CHAPTERS = 50;

export function addChapter(documentId: string, title?: string): Document | undefined {
  const doc = documents.get(documentId);
  if (!doc) return undefined;
  if (doc.chapters.length >= MAX_CHAPTERS) return undefined;

  const nextIndex = doc.chapters.length;
  const chapterTitle = title?.trim() || formatChapterTitle(nextIndex);
  const chapters = [...doc.chapters, emptyChapter(nextIndex, chapterTitle)];
  return updateDocument(documentId, { chapters });
}

function applyRevisionToDocument(rev: Revision) {
  const doc = documents.get(rev.documentId);
  if (!doc) return;
  updateDocument(rev.documentId, {
    currentRevisionId: rev.id,
    revisionCount: doc.revisionCount + 1,
  });
  if (rev.blockId) {
    const found = findBlock(doc, rev.blockId);
    if (found) {
      saveDocumentContent(rev.documentId, found.chapter.id, rev.blockId, rev.snapshot);
    }
  }
}

/** 同一块仅保留一条待查看建议，新建时作废旧 pending */
function supersedePendingRevisionsForBlock(documentId: string, blockId: string): void {
  let changed = false;
  for (const rev of revisions.values()) {
    if (
      rev.documentId === documentId &&
      rev.blockId === blockId &&
      rev.status === 'pending'
    ) {
      revisions.set(rev.id, { ...rev, status: 'rejected' });
      changed = true;
    }
  }
  if (changed) persist();
}

export function createRevision(
  input: Omit<Revision, 'id' | 'createdAt' | 'timezone'>,
): Revision {
  if (input.status === 'pending' && input.blockId) {
    supersedePendingRevisionsForBlock(input.documentId, input.blockId);
  }
  const rev: Revision = {
    ...input,
    id: randomUUID(),
    createdAt: now(),
    timezone: 'Asia/Shanghai',
  };
  revisions.set(rev.id, rev);
  if (rev.status === 'accepted') {
    applyRevisionToDocument(rev);
  }
  persist();
  return rev;
}

export function acceptRevision(
  revisionId: string,
  editedSnapshot?: string,
): Revision | undefined {
  const rev = revisions.get(revisionId);
  if (!rev || rev.status !== 'pending') return undefined;

  const snapshot = editedSnapshot ?? rev.snapshot;
  const manuallyEdited =
    editedSnapshot != null && editedSnapshot !== rev.snapshot;

  let summary = rev.summary.startsWith('您同意了')
    ? rev.summary
    : `您同意了「${rev.summary}」`;
  if (manuallyEdited) {
    summary = `${summary}（采纳前您又改了几个字）`;
  }

  const updated: Revision = {
    ...rev,
    snapshot,
    status: 'accepted',
    summary,
  };
  revisions.set(revisionId, updated);
  applyRevisionToDocument(updated);
  persist();
  return updated;
}

export function rejectRevision(revisionId: string): Revision | undefined {
  const rev = revisions.get(revisionId);
  if (!rev) return undefined;
  const updated: Revision = { ...rev, status: 'rejected' };
  revisions.set(revisionId, updated);
  persist();
  return updated;
}

export function listRevisions(documentId: string): Revision[] {
  return [...revisions.values()]
    .filter((r) => r.documentId === documentId && r.status !== 'rejected')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getRevision(id: string): Revision | undefined {
  return revisions.get(id);
}

export function createChatSession(title: string): ChatSession {
  const session: ChatSession = {
    id: randomUUID(),
    title,
    createdAt: now(),
    updatedAt: now(),
  };
  chatSessions.set(session.id, session);
  chatMessages.set(session.id, []);
  persist();
  return session;
}

function lastUserQuestionForSession(sessionId: string): string | null {
  const messages = chatMessages.get(sessionId) ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === 'user') {
      const text = m.content.trim();
      if (text) return text;
    }
  }
  return null;
}

export function listChatSessions(): ChatSession[] {
  return [...chatSessions.values()]
    .map((session) => ({
      ...session,
      lastQuestion: lastUserQuestionForSession(session.id),
    }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function getChatSession(sessionId: string): ChatSession | undefined {
  return chatSessions.get(sessionId);
}

export function updateChatSessionContext(
  sessionId: string,
  contextSummary: string,
  contextSummaryUpToMessageId: string | null,
): ChatSession | undefined {
  const session = chatSessions.get(sessionId);
  if (!session) return undefined;
  const updated: ChatSession = {
    ...session,
    contextSummary: contextSummary.trim() || null,
    contextSummaryUpToMessageId,
    updatedAt: now(),
  };
  chatSessions.set(sessionId, updated);
  persist();
  return updated;
}

export function updateDocumentContextFields(
  documentId: string,
  fields: {
    writingContextSummary?: string | null;
    writingContextSummaryUpToMessageId?: string | null;
    documentContextSummary?: string | null;
    storyBible?: StoryBible | null;
  },
): Document | undefined {
  const doc = documents.get(documentId);
  if (!doc) return undefined;
  const updated: Document = { ...doc, ...fields, updatedAt: now() };
  documents.set(documentId, updated);
  persist();
  return updated;
}

export function updateChatSessionTitle(
  sessionId: string,
  title: string,
): ChatSession | undefined {
  const session = chatSessions.get(sessionId);
  if (!session) return undefined;
  const cleaned = title.trim().replace(/\s+/g, ' ').slice(0, 32);
  if (!cleaned) return session;
  session.title = cleaned;
  session.updatedAt = now();
  chatSessions.set(sessionId, session);
  persist();
  return session;
}

export function getChatMessages(sessionId: string): ChatMessage[] {
  return chatMessages.get(sessionId) ?? [];
}

export function addChatMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  options?: Pick<ChatMessage, 'imagePreviewUris'>,
): ChatMessage | undefined {
  const session = chatSessions.get(sessionId);
  if (!session) return undefined;
  const msg: ChatMessage = {
    id: randomUUID(),
    sessionId,
    role,
    content,
    createdAt: now(),
    ...(options?.imagePreviewUris?.length
      ? { imagePreviewUris: [...options.imagePreviewUris] }
      : {}),
  };
  const list = chatMessages.get(sessionId) ?? [];
  list.push(msg);
  chatMessages.set(sessionId, list);
  session.updatedAt = now();
  chatSessions.set(sessionId, session);
  persist();
  return msg;
}

/** 开发用：预置一篇示例文稿 */
export function seedDemo() {
  if (documents.size > 0) return;
  const doc = createDocument('我的文章');
  const ch = doc.chapters[0];
  const block = ch.blocks[0];
  saveDocumentContent(
    doc.id,
    ch.id,
    block.id,
    '小时候我最怕走夜路，村里没有路灯，一黑我就攥着奶奶的手。',
  );
}

export function getWritingAssistantMessages(documentId: string): WritingAssistantMessage[] {
  return writingAssistantMessages.get(documentId) ?? [];
}

export function addWritingAssistantMessage(
  input: Omit<WritingAssistantMessage, 'id' | 'createdAt'>,
): WritingAssistantMessage | undefined {
  if (!documents.has(input.documentId)) return undefined;
  const msg: WritingAssistantMessage = {
    ...input,
    id: randomUUID(),
    createdAt: now(),
  };
  const list = writingAssistantMessages.get(input.documentId) ?? [];
  list.push(msg);
  writingAssistantMessages.set(input.documentId, list);
  persist();
  return msg;
}

export function updateWritingAssistantMessage(
  documentId: string,
  messageId: string,
  patch: Partial<WritingAssistantMessage>,
): WritingAssistantMessage | undefined {
  const list = writingAssistantMessages.get(documentId);
  if (!list) return undefined;
  const idx = list.findIndex((m) => m.id === messageId);
  if (idx < 0) return undefined;
  const updated = { ...list[idx], ...patch };
  list[idx] = updated;
  writingAssistantMessages.set(documentId, list);
  persist();
  return updated;
}

export function getWritingAssistantMessage(
  documentId: string,
  messageId: string,
): WritingAssistantMessage | undefined {
  return getWritingAssistantMessages(documentId).find((m) => m.id === messageId);
}

export function ensureWritingAssistantWelcome(documentId: string, welcomeText: string): void {
  const list = getWritingAssistantMessages(documentId);
  if (list.length > 0) return;
  addWritingAssistantMessage({
    documentId,
    role: 'assistant',
    content: welcomeText,
    kind: 'notice',
  });
}

export function findBlock(
  doc: Document,
  blockId: string,
): { chapter: Chapter; block: Block } | undefined {
  for (const chapter of doc.chapters) {
    const block = chapter.blocks.find((b) => b.id === blockId);
    if (block) return { chapter, block };
  }
  return undefined;
}
