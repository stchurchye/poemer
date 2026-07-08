import { formatChapterTitle } from '../document/formatChapterTitle.js';
import { randomId } from '../randomId.js';
const MAX_CHAPTERS = 50;
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
function emptyChapter(uuid, order, title) {
    const blockId = uuid();
    return {
        id: uuid(),
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
export function findBlock(doc, blockId) {
    for (const chapter of doc.chapters) {
        const block = chapter.blocks.find((b) => b.id === blockId);
        if (block)
            return { chapter, block };
    }
    return undefined;
}
export function createLocalStore(initial, deps) {
    const now = deps?.now ?? (() => new Date().toISOString());
    const uuid = deps?.uuid ?? randomId;
    const documents = new Map();
    const revisions = new Map();
    const chatSessions = new Map();
    const chatMessages = new Map();
    const writingAssistantMessages = new Map();
    function hydrate(data) {
        documents.clear();
        revisions.clear();
        chatSessions.clear();
        chatMessages.clear();
        writingAssistantMessages.clear();
        for (const doc of data.documents)
            documents.set(doc.id, clone(doc));
        for (const rev of data.revisions)
            revisions.set(rev.id, clone(rev));
        for (const s of data.chatSessions)
            chatSessions.set(s.id, clone(s));
        for (const [id, msgs] of Object.entries(data.chatMessages ?? {})) {
            chatMessages.set(id, clone(msgs));
        }
        for (const [id, msgs] of Object.entries(data.writingAssistantMessages ?? {})) {
            writingAssistantMessages.set(id, clone(msgs));
        }
    }
    hydrate(initial);
    function snapshot() {
        return {
            documents: [...documents.values()].map((d) => clone(d)),
            revisions: [...revisions.values()].map((r) => clone(r)),
            chatSessions: [...chatSessions.values()].map((s) => clone(s)),
            chatMessages: Object.fromEntries([...chatMessages.entries()].map(([id, msgs]) => [id, clone(msgs)])),
            writingAssistantMessages: Object.fromEntries([...writingAssistantMessages.entries()].map(([id, msgs]) => [id, clone(msgs)])),
        };
    }
    function replace(next) {
        hydrate(next);
    }
    function createDocument(title) {
        const id = uuid();
        const ts = now();
        const doc = {
            id,
            title,
            chapters: [emptyChapter(uuid, 0, formatChapterTitle(0))],
            globalSummary: '',
            styleGuide: '',
            currentRevisionId: null,
            revisionCount: 0,
            updatedAt: ts,
            createdAt: ts,
            hiddenAt: null,
        };
        documents.set(id, doc);
        return clone(doc);
    }
    function listDocuments() {
        return [...documents.values()]
            .map((d) => clone(d))
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    function getDocument(id) {
        const doc = documents.get(id);
        return doc ? clone(doc) : undefined;
    }
    function updateDocument(id, patch) {
        const doc = documents.get(id);
        if (!doc)
            return undefined;
        const updated = { ...doc, ...patch, updatedAt: now() };
        documents.set(id, updated);
        return clone(updated);
    }
    function hideDocument(id) {
        const doc = documents.get(id);
        if (!doc)
            return undefined;
        const updated = { ...doc, hiddenAt: now(), updatedAt: now() };
        documents.set(id, updated);
        return clone(updated);
    }
    function restoreDocument(id) {
        const doc = documents.get(id);
        if (!doc)
            return undefined;
        const updated = { ...doc, hiddenAt: null, updatedAt: now() };
        documents.set(id, updated);
        return clone(updated);
    }
    function saveDocumentContent(documentId, chapterId, blockId, content) {
        const doc = documents.get(documentId);
        if (!doc)
            return undefined;
        const chapters = doc.chapters.map((ch) => {
            if (ch.id !== chapterId)
                return ch;
            return {
                ...ch,
                blocks: ch.blocks.map((b) => (b.id === blockId ? { ...b, content } : b)),
            };
        });
        return updateDocument(documentId, { chapters });
    }
    function updateChapterTitle(documentId, chapterId, title) {
        const doc = documents.get(documentId);
        if (!doc)
            return undefined;
        const chapter = doc.chapters.find((c) => c.id === chapterId);
        if (!chapter)
            return undefined;
        if (chapter.title === title)
            return clone(doc);
        const chapters = doc.chapters.map((ch) => ch.id === chapterId ? { ...ch, title } : ch);
        return updateDocument(documentId, { chapters });
    }
    function addChapter(documentId, title) {
        const doc = documents.get(documentId);
        if (!doc)
            return undefined;
        if (doc.chapters.length >= MAX_CHAPTERS)
            return undefined;
        const nextIndex = doc.chapters.length;
        const chapterTitle = title?.trim() || formatChapterTitle(nextIndex);
        const chapters = [...doc.chapters, emptyChapter(uuid, nextIndex, chapterTitle)];
        return updateDocument(documentId, { chapters });
    }
    function applyRevisionToDocument(rev) {
        const doc = documents.get(rev.documentId);
        if (!doc)
            return;
        updateDocument(rev.documentId, {
            currentRevisionId: rev.id,
            revisionCount: doc.revisionCount + 1,
        });
        if (rev.blockId) {
            const found = findBlock(documents.get(rev.documentId), rev.blockId);
            if (found) {
                saveDocumentContent(rev.documentId, found.chapter.id, rev.blockId, rev.snapshot);
            }
        }
    }
    function supersedePendingRevisionsForBlock(documentId, blockId) {
        for (const rev of revisions.values()) {
            if (rev.documentId === documentId &&
                rev.blockId === blockId &&
                rev.status === 'pending') {
                revisions.set(rev.id, { ...rev, status: 'rejected' });
            }
        }
    }
    function createRevision(input) {
        if (input.status === 'pending' && input.blockId) {
            supersedePendingRevisionsForBlock(input.documentId, input.blockId);
        }
        const rev = {
            ...input,
            id: uuid(),
            createdAt: now(),
            timezone: 'Asia/Shanghai',
        };
        revisions.set(rev.id, rev);
        if (rev.status === 'accepted') {
            applyRevisionToDocument(rev);
        }
        return clone(rev);
    }
    function acceptRevision(revisionId, editedSnapshot) {
        const rev = revisions.get(revisionId);
        if (!rev || rev.status !== 'pending')
            return undefined;
        const snapshot = editedSnapshot ?? rev.snapshot;
        const manuallyEdited = editedSnapshot != null && editedSnapshot !== rev.snapshot;
        let summary = rev.summary.startsWith('您同意了') ? rev.summary : `您同意了「${rev.summary}」`;
        if (manuallyEdited) {
            summary = `${summary}（采纳前您又改了几个字）`;
        }
        const updated = {
            ...rev,
            snapshot,
            status: 'accepted',
            summary,
        };
        revisions.set(revisionId, updated);
        applyRevisionToDocument(updated);
        return clone(updated);
    }
    function rejectRevision(revisionId) {
        const rev = revisions.get(revisionId);
        if (!rev)
            return undefined;
        const updated = { ...rev, status: 'rejected' };
        revisions.set(revisionId, updated);
        return clone(updated);
    }
    function listRevisions(documentId) {
        return [...revisions.values()]
            .filter((r) => r.documentId === documentId && r.status !== 'rejected')
            .map((r) => clone(r))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    function getRevision(revisionId) {
        const rev = revisions.get(revisionId);
        return rev ? clone(rev) : undefined;
    }
    function rollback(documentId, revisionId) {
        const target = revisions.get(revisionId);
        const doc = documents.get(documentId);
        if (!target || !doc || target.documentId !== documentId)
            return undefined;
        if (target.blockId) {
            const found = findBlock(doc, target.blockId);
            if (found) {
                saveDocumentContent(documentId, found.chapter.id, target.blockId, target.snapshot);
            }
        }
        return createRevision({
            documentId: doc.id,
            blockId: target.blockId,
            parentRevisionId: doc.currentRevisionId,
            snapshot: target.snapshot,
            previousSnapshot: null,
            summary: `恢复到 ${target.summary}`,
            source: 'rollback',
            status: 'accepted',
        });
    }
    function createChatSession(title) {
        const session = {
            id: uuid(),
            title,
            createdAt: now(),
            updatedAt: now(),
        };
        chatSessions.set(session.id, session);
        chatMessages.set(session.id, []);
        return clone(session);
    }
    function lastUserQuestionForSession(sessionId) {
        const messages = chatMessages.get(sessionId) ?? [];
        for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            if (m?.role === 'user') {
                const text = m.content.trim();
                if (text)
                    return text;
            }
        }
        return null;
    }
    function listChatSessions() {
        return [...chatSessions.values()]
            .map((session) => ({
            ...clone(session),
            lastQuestion: lastUserQuestionForSession(session.id),
        }))
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    function getChatSession(sessionId) {
        const session = chatSessions.get(sessionId);
        return session ? clone(session) : undefined;
    }
    function updateChatSessionContext(sessionId, contextSummary, contextSummaryUpToMessageId) {
        const session = chatSessions.get(sessionId);
        if (!session)
            return undefined;
        const updated = {
            ...session,
            contextSummary: contextSummary.trim() || null,
            contextSummaryUpToMessageId,
            updatedAt: now(),
        };
        chatSessions.set(sessionId, updated);
        return clone(updated);
    }
    function updateDocumentContextFields(documentId, fields) {
        const doc = documents.get(documentId);
        if (!doc)
            return undefined;
        // 只写显式提供的字段（value !== undefined），避免「键存在即覆盖」清空已有摘要/设定卡
        const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
        const updated = { ...doc, ...patch, updatedAt: now() };
        documents.set(documentId, updated);
        return clone(updated);
    }
    function updateChatSessionTitle(sessionId, title) {
        const session = chatSessions.get(sessionId);
        if (!session)
            return undefined;
        const cleaned = title.trim().replace(/\s+/g, ' ').slice(0, 32);
        if (!cleaned)
            return clone(session);
        const updated = { ...session, title: cleaned, updatedAt: now() };
        chatSessions.set(sessionId, updated);
        return clone(updated);
    }
    function getChatMessages(sessionId) {
        return clone(chatMessages.get(sessionId) ?? []);
    }
    function addChatMessage(sessionId, role, content, options) {
        const session = chatSessions.get(sessionId);
        if (!session)
            return undefined;
        const msg = {
            id: uuid(),
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
        return clone(msg);
    }
    function getWritingAssistantMessages(documentId) {
        return clone(writingAssistantMessages.get(documentId) ?? []);
    }
    function addWritingAssistantMessage(input) {
        if (!documents.has(input.documentId))
            return undefined;
        const msg = {
            ...input,
            id: uuid(),
            createdAt: now(),
        };
        const list = writingAssistantMessages.get(input.documentId) ?? [];
        list.push(msg);
        writingAssistantMessages.set(input.documentId, list);
        return clone(msg);
    }
    function updateWritingAssistantMessage(documentId, messageId, patch) {
        const list = writingAssistantMessages.get(documentId);
        if (!list)
            return undefined;
        const idx = list.findIndex((m) => m.id === messageId);
        if (idx < 0)
            return undefined;
        const updated = { ...list[idx], ...patch };
        list[idx] = updated;
        writingAssistantMessages.set(documentId, list);
        return clone(updated);
    }
    function getWritingAssistantMessage(documentId, messageId) {
        return getWritingAssistantMessages(documentId).find((m) => m.id === messageId);
    }
    function ensureWritingAssistantWelcome(documentId, welcomeText) {
        const list = writingAssistantMessages.get(documentId) ?? [];
        if (list.length > 0)
            return;
        addWritingAssistantMessage({
            documentId,
            role: 'assistant',
            content: welcomeText,
            kind: 'notice',
        });
    }
    return {
        snapshot,
        replace,
        createDocument,
        listDocuments,
        getDocument,
        updateDocument,
        hideDocument,
        restoreDocument,
        saveDocumentContent,
        updateChapterTitle,
        addChapter,
        createRevision,
        acceptRevision,
        rejectRevision,
        listRevisions,
        getRevision,
        rollback,
        createChatSession,
        listChatSessions,
        getChatSession,
        updateChatSessionContext,
        updateDocumentContextFields,
        updateChatSessionTitle,
        getChatMessages,
        addChatMessage,
        getWritingAssistantMessages,
        addWritingAssistantMessage,
        updateWritingAssistantMessage,
        getWritingAssistantMessage,
        ensureWritingAssistantWelcome,
        findBlock: (docId, blockId) => {
            const doc = documents.get(docId);
            return doc ? findBlock(doc, blockId) : undefined;
        },
    };
}
//# sourceMappingURL=createLocalStore.js.map