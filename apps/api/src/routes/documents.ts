import { Hono } from 'hono';
import { jsonError } from '../lib/errors.js';
import type { AppVariables } from '../types.js';
import { log } from '../lib/logger.js';
import {
  deepseekWriting,
  deepseekWritingIntentFromMessages,
  deepseekWritingChatFromMessages,
  deepseekWritingRetry,
  parseReplyDialect,
} from '../lib/deepseek.js';
import {
  ensureWritingExecuteBasis,
  stripWritingIntentDisplayText,
  type WritingExecuteBasis,
} from '@shiren/shared';
import { completeWritingExecuteRaw } from '../lib/writingExecuteCompletion.js';
import {
  commitPreparedWritingContext,
  prepareWritingExecuteContext,
  prepareWritingIntentContext,
  prepareWritingChatContext,
  previewWritingIntentContextPreview,
  previewWritingIntentContextUsage,
} from '../lib/contextPipeline.js';
import {
  parseContextSelectionFromBody,
  parseContextSelectionFromQuery,
} from '../lib/contextSelectionParse.js';
import { getDeepSeekKey, handleAiError } from '../lib/ai-handler.js';
import {
  acceptRevision,
  addChapter,
  addWritingAssistantMessage,
  createDocument,
  createRevision,
  ensureWritingAssistantWelcome,
  findBlock,
  getDocument,
  getRevision,
  getWritingAssistantMessage,
  getWritingAssistantMessages,
  listDocuments,
  listRevisions,
  rejectRevision,
  saveDocumentContent,
  updateDocument,
  updateWritingAssistantMessage,
} from '../store/db.js';
import {
  ErrorCodes,
  REPLY_DIALECT_HEADER,
  assistantWelcomeLine,
  assistantRevisionReadyLine,
  buildWritingAssistantContextBlocks,
  writingDoneComment,
  type WritingUnderstandingScope,
} from '@shiren/shared';

export const documentsRouter = new Hono<{ Variables: AppVariables }>();

function replyDialectFromRequest(c: { req: { header: (name: string) => string | undefined } }) {
  return parseReplyDialect(c.req.header(REPLY_DIALECT_HEADER));
}

documentsRouter.get('/', (c) => {
  return c.json({ ok: true, data: listDocuments(), requestId: c.get('requestId') });
});

documentsRouter.post('/', async (c) => {
  const body = await c.req.json<{ title?: string }>();
  const title = body.title?.trim() || '未命名文稿';
  const doc = createDocument(title);
  log('info', 'document.created', { documentId: doc.id, requestId: c.get('requestId') });
  return c.json({ ok: true, data: doc, requestId: c.get('requestId') }, 201);
});

documentsRouter.get('/:id', (c) => {
  const doc = getDocument(c.req.param('id'));
  if (!doc) return jsonError(c, ErrorCodes.NOT_FOUND, 404);
  return c.json({ ok: true, data: doc, requestId: c.get('requestId') });
});

documentsRouter.patch('/:id', async (c) => {
  const doc = updateDocument(c.req.param('id'), await c.req.json());
  if (!doc) return jsonError(c, ErrorCodes.NOT_FOUND, 404);
  return c.json({ ok: true, data: doc, requestId: c.get('requestId') });
});

documentsRouter.post('/:id/chapters', async (c) => {
  const documentId = c.req.param('id');
  if (!getDocument(documentId)) {
    return jsonError(c, ErrorCodes.NOT_FOUND, 404);
  }
  const body = (await c.req.json<{ title?: string }>().catch(() => ({}))) as {
    title?: string;
  };
  const doc = addChapter(documentId, body.title);
  if (!doc) {
    return jsonError(c, ErrorCodes.VALIDATION, 400);
  }
  log('info', 'chapter.added', { documentId, requestId: c.get('requestId') });
  return c.json({ ok: true, data: doc, requestId: c.get('requestId') }, 201);
});

documentsRouter.get('/:id/revisions', (c) => {
  const doc = getDocument(c.req.param('id'));
  if (!doc) return jsonError(c, ErrorCodes.NOT_FOUND, 404);
  return c.json({
    ok: true,
    data: listRevisions(c.req.param('id')),
    requestId: c.get('requestId'),
  });
});

/** 按 id 拉取单条改稿（含已拒绝），供「看一看」打开历史气泡 */
documentsRouter.get('/:id/revisions/:revisionId', (c) => {
  const documentId = c.req.param('id');
  const doc = getDocument(documentId);
  if (!doc) return jsonError(c, ErrorCodes.NOT_FOUND, 404);
  const rev = getRevision(c.req.param('revisionId'));
  if (!rev || rev.documentId !== documentId) {
    return jsonError(c, ErrorCodes.REVISION_NOT_FOUND, 404);
  }
  return c.json({ ok: true, data: rev, requestId: c.get('requestId') });
});

documentsRouter.post('/:id/ai', async (c) => {
  const documentId = c.req.param('id');
  const doc = getDocument(documentId);
  if (!doc) return jsonError(c, ErrorCodes.NOT_FOUND, 404);

  const body = await c.req.json<{
    action: string;
    blockId: string;
    instruction?: string;
    retry?: {
      baseInstruction: string;
      previousSuggestion: string;
      additionalFeedback: string;
      priorFeedback?: string[];
    };
  }>();

  const found = findBlock(doc, body.blockId);
  if (!found) return jsonError(c, ErrorCodes.NOT_FOUND, 404);

  const { block } = found;
  const oldText = block.content;
  const action = body.action || '润色';

  let apiKey: string;
  try {
    apiKey = getDeepSeekKey(c);
  } catch (e) {
    return handleAiError(c, e);
  }

  const dialect = replyDialectFromRequest(c);
  let suggested: string;
  let comment: string;
  let executeBasis: WritingExecuteBasis;
  try {
    if (body.retry) {
      const feedback = body.retry.additionalFeedback?.trim();
      if (!feedback) {
        return jsonError(c, ErrorCodes.VALIDATION, 400);
      }
      const result = await deepseekWritingRetry({
        apiKey,
        action,
        oldText,
        baseInstruction: body.retry.baseInstruction ?? '',
        previousSuggestion: body.retry.previousSuggestion,
        additionalFeedback: feedback,
        priorFeedback: body.retry.priorFeedback,
        styleGuide: doc.styleGuide,
        dialect,
      });
      suggested = result.text;
      comment = result.comment;
      executeBasis = ensureWritingExecuteBasis(result.basis, action);
    } else {
      const result = await deepseekWriting({
        apiKey,
        action,
        oldText,
        instruction: body.instruction,
        styleGuide: doc.styleGuide,
        dialect,
      });
      suggested = result.text;
      comment = result.comment;
      executeBasis = ensureWritingExecuteBasis(result.basis, action);
    }
  } catch (e) {
    return handleAiError(c, e);
  }

  log('info', 'ai.suggest', {
    documentId,
    action,
    model: 'deepseek-v4-pro',
    requestId: c.get('requestId'),
  });

  const suggestInstruction = body.retry
    ? [body.retry.baseInstruction?.trim(), body.retry.additionalFeedback?.trim()]
        .filter(Boolean)
        .join('\n')
    : body.instruction?.trim();

  const revision = createRevision({
    documentId,
    blockId: body.blockId,
    parentRevisionId: block.currentRevisionId,
    snapshot: suggested,
    previousSnapshot: oldText,
    summary:
      action === '续写'
        ? `续写了${found.chapter.title}的一段`
        : `润色了${found.chapter.title}的一段`,
    source: 'ai',
    status: 'pending',
    suggestAction: action,
    suggestInstruction: suggestInstruction || undefined,
    suggestEvaluation: executeBasis.evaluation,
    suggestRationale: executeBasis.rationale,
  });

  return c.json({
    ok: true,
    data: {
      revision,
      oldText,
      newText: suggested,
      comment,
    },
    requestId: c.get('requestId'),
  });
});

documentsRouter.post('/:id/revisions/:revisionId/accept', async (c) => {
  const rev = getRevision(c.req.param('revisionId'));
  if (!rev || rev.documentId !== c.req.param('id')) {
    return jsonError(c, ErrorCodes.REVISION_NOT_FOUND, 404);
  }
  if (rev.status !== 'pending') {
    return jsonError(c, ErrorCodes.REVISION_EXPIRED, 400);
  }

  let editedSnapshot: string | undefined;
  try {
    const body = await c.req.json<{ editedSnapshot?: string }>();
    if (body.editedSnapshot !== undefined) {
      const trimmed = body.editedSnapshot.trim();
      if (!trimmed) {
        return jsonError(c, ErrorCodes.VALIDATION, 400);
      }
      editedSnapshot = trimmed;
    }
  } catch {
    // 无请求体时与旧版行为一致
  }

  const accepted = acceptRevision(c.req.param('revisionId'), editedSnapshot);
  if (!accepted) return jsonError(c, ErrorCodes.REVISION_EXPIRED, 400);
  return c.json({ ok: true, data: getDocument(c.req.param('id')), requestId: c.get('requestId') });
});

documentsRouter.post('/:id/revisions/:revisionId/reject', (c) => {
  const rev = getRevision(c.req.param('revisionId'));
  if (!rev || rev.documentId !== c.req.param('id')) {
    return jsonError(c, ErrorCodes.REVISION_NOT_FOUND, 404);
  }
  if (rev.status !== 'pending') {
    return jsonError(c, ErrorCodes.REVISION_EXPIRED, 400);
  }
  const rejected = rejectRevision(c.req.param('revisionId'));
  if (!rejected) return jsonError(c, ErrorCodes.REVISION_NOT_FOUND, 404);
  return c.json({ ok: true, data: rejected, requestId: c.get('requestId') });
});

documentsRouter.post('/:id/rollback', async (c) => {
  const body = await c.req.json<{ revisionId: string }>();
  const target = getRevision(body.revisionId);
  const doc = getDocument(c.req.param('id'));
  if (!target || !doc) return jsonError(c, ErrorCodes.NOT_FOUND, 404);

  if (target.blockId) {
    const found = findBlock(doc, target.blockId);
    if (found) {
      saveDocumentContent(doc.id, found.chapter.id, target.blockId, target.snapshot);
    }
  }

  const rollback = createRevision({
    documentId: doc.id,
    blockId: target.blockId,
    parentRevisionId: doc.currentRevisionId,
    snapshot: target.snapshot,
    previousSnapshot: null,
    summary: `恢复到 ${target.summary}`,
    source: 'rollback',
    status: 'accepted',
  });

  return c.json({ ok: true, data: rollback, requestId: c.get('requestId') });
});

documentsRouter.get('/:id/assistant/messages', (c) => {
  const documentId = c.req.param('id');
  const doc = getDocument(documentId);
  if (!doc) return jsonError(c, ErrorCodes.NOT_FOUND, 404);
  ensureWritingAssistantWelcome(documentId, assistantWelcomeLine(replyDialectFromRequest(c)));
  return c.json({
    ok: true,
    data: getWritingAssistantMessages(documentId),
    requestId: c.get('requestId'),
  });
});

type WritingAssistantContextBody = {
  chapterTitle?: string;
  chapterContent?: string;
  documentExcerpt?: string;
  pending?: string;
  contextSelection?: import('@shiren/shared').ContextSelection;
};

function writingAssistantContextFields(
  input: WritingAssistantContextBody,
  referenceScope?: WritingUnderstandingScope,
) {
  const chapterTitle = input.chapterTitle?.trim() ?? '';
  const chapterContent = input.chapterContent?.trim() ?? '';
  const documentExcerpt = input.documentExcerpt?.trim() ?? '';
  const { chapterBlock, documentBlock } = buildWritingAssistantContextBlocks({
    chapterTitle,
    chapterContent: chapterContent || input.pending?.trim() || '（本章尚无正文）',
    documentExcerpt,
    referenceScope,
  });
  return {
    chapterBlock,
    documentBlock,
    pendingUser: input.pending?.trim() ?? '',
  };
}

documentsRouter.get('/:id/assistant/context-usage', async (c) => {
  const documentId = c.req.param('id');
  const doc = getDocument(documentId);
  if (!doc) return jsonError(c, ErrorCodes.NOT_FOUND, 404);

  const dialect = replyDialectFromRequest(c);
  const contextSelection = parseContextSelectionFromQuery(c);
  const { chapterBlock, documentBlock, pendingUser } = writingAssistantContextFields({
    chapterTitle: c.req.query('chapterTitle') ?? '',
    chapterContent: c.req.query('chapterContent') ?? '',
    documentExcerpt: c.req.query('documentExcerpt') ?? '',
    pending: c.req.query('pending') ?? '',
  });

  const usage = await previewWritingIntentContextUsage({
    document: doc,
    allMessages: getWritingAssistantMessages(documentId),
    chapterBlock,
    documentBlock,
    pendingUser,
    dialect,
    contextSelection,
  });

  return c.json({ ok: true, data: usage, requestId: c.get('requestId') });
});

documentsRouter.post('/:id/assistant/context-usage', async (c) => {
  const documentId = c.req.param('id');
  const doc = getDocument(documentId);
  if (!doc) return jsonError(c, ErrorCodes.NOT_FOUND, 404);

  const body = await c.req.json<WritingAssistantContextBody>();
  const dialect = replyDialectFromRequest(c);
  const contextSelection = parseContextSelectionFromBody(body);
  const { chapterBlock, documentBlock, pendingUser } = writingAssistantContextFields(body);

  const usage = await previewWritingIntentContextUsage({
    document: doc,
    allMessages: getWritingAssistantMessages(documentId),
    chapterBlock,
    documentBlock,
    pendingUser,
    dialect,
    contextSelection,
  });

  return c.json({ ok: true, data: usage, requestId: c.get('requestId') });
});

documentsRouter.get('/:id/assistant/context-preview', async (c) => {
  const documentId = c.req.param('id');
  const doc = getDocument(documentId);
  if (!doc) return jsonError(c, ErrorCodes.NOT_FOUND, 404);

  const dialect = replyDialectFromRequest(c);
  const contextSelection = parseContextSelectionFromQuery(c);
  const { chapterBlock, documentBlock, pendingUser } = writingAssistantContextFields({
    chapterTitle: c.req.query('chapterTitle') ?? '',
    chapterContent: c.req.query('chapterContent') ?? '',
    documentExcerpt: c.req.query('documentExcerpt') ?? '',
    pending: c.req.query('pending') ?? '',
  });

  const data = await previewWritingIntentContextPreview({
    document: doc,
    allMessages: getWritingAssistantMessages(documentId),
    chapterBlock,
    documentBlock,
    pendingUser,
    dialect,
    contextSelection,
  });

  return c.json({ ok: true, data, requestId: c.get('requestId') });
});

documentsRouter.post('/:id/assistant/context-preview', async (c) => {
  const documentId = c.req.param('id');
  const doc = getDocument(documentId);
  if (!doc) return jsonError(c, ErrorCodes.NOT_FOUND, 404);

  const body = await c.req.json<WritingAssistantContextBody>();
  const dialect = replyDialectFromRequest(c);
  const contextSelection = parseContextSelectionFromBody(body);
  const { chapterBlock, documentBlock, pendingUser } = writingAssistantContextFields(body);

  const data = await previewWritingIntentContextPreview({
    document: doc,
    allMessages: getWritingAssistantMessages(documentId),
    chapterBlock,
    documentBlock,
    pendingUser,
    dialect,
    contextSelection,
  });

  return c.json({ ok: true, data, requestId: c.get('requestId') });
});

documentsRouter.post('/:id/assistant/intent', async (c) => {
  const documentId = c.req.param('id');
  const doc = getDocument(documentId);
  if (!doc) return jsonError(c, ErrorCodes.NOT_FOUND, 404);

  const body = await c.req.json<{
    content?: string;
    articleExcerpt?: string;
    chapterTitle?: string;
    chapterContent?: string;
    documentExcerpt?: string;
    contextSelection?: import('@shiren/shared').ContextSelection;
    source?: 'text' | 'voice';
    /** 跳过意图分类，直接侧栏对话（如 guide 弹窗选「我只是问问题」） */
    directChat?: boolean;
    referenceScope?: import('@shiren/shared').WritingUnderstandingScope;
  }>();
  const content = body.content?.trim();
  if (!content) return jsonError(c, ErrorCodes.VALIDATION, 400);
  const contextSelection = parseContextSelectionFromBody(body);

  let apiKey: string;
  try {
    apiKey = getDeepSeekKey(c);
  } catch (e) {
    return handleAiError(c, e);
  }

  const dialect = replyDialectFromRequest(c);
  const chapterTitle = body.chapterTitle?.trim() ?? '';
  const chapterContent = body.chapterContent?.trim() ?? '';
  const documentExcerpt = body.documentExcerpt?.trim() ?? '';
  const { chapterBlock, documentBlock } = buildWritingAssistantContextBlocks({
    chapterTitle,
    chapterContent: chapterContent || body.articleExcerpt?.trim() || '（本章尚无正文）',
    documentExcerpt,
    referenceScope: 'document',
  });

  let prepared;
  try {
    prepared = await prepareWritingIntentContext({
      apiKey,
      documentId,
      document: doc,
      allMessages: getWritingAssistantMessages(documentId),
      chapterBlock,
      documentBlock,
      userMessage: content,
      dialect,
      contextSelection,
      referenceScope: 'document',
    });
  } catch (e) {
    return handleAiError(c, e);
  }

  const source = body.source === 'voice' ? 'voice' : 'text';
  const directChatScope =
    body.referenceScope === 'chapter' ? 'chapter' : 'document';

  if (body.directChat) {
    log('info', 'writing.directChat', {
      documentId,
      dialect,
      referenceScope: directChatScope,
      requestId: c.get('requestId'),
    });
    const scopedBlocks = buildWritingAssistantContextBlocks({
      chapterTitle,
      chapterContent: chapterContent || body.articleExcerpt?.trim() || '（本章尚无正文）',
      documentExcerpt,
      referenceScope: directChatScope,
    });
    let chatPrepared;
    try {
      chatPrepared = await prepareWritingChatContext({
        apiKey,
        documentId,
        document: prepared.document,
        allMessages: getWritingAssistantMessages(documentId),
        chapterBlock: scopedBlocks.chapterBlock,
        documentBlock: scopedBlocks.documentBlock,
        userMessage: content,
        dialect,
        contextSelection,
        referenceScope: directChatScope,
      });
    } catch (e) {
      return handleAiError(c, e);
    }
    let chatReply: string;
    try {
      chatReply = await deepseekWritingChatFromMessages(apiKey, chatPrepared.messages);
    } catch (e) {
      return handleAiError(c, e);
    }
    const userMsg = addWritingAssistantMessage({
      documentId,
      role: 'user',
      content,
      kind: 'chat',
    })!;
    const assistantMsg = addWritingAssistantMessage({
      documentId,
      role: 'assistant',
      content: chatReply.trim(),
      kind: 'chat',
    })!;
    // 修 review#1：回复+消息成功入库后才提交写作侧压缩产物
    commitPreparedWritingContext(documentId, chatPrepared);
    return c.json({
      ok: true,
      data: {
        mode: 'chat',
        referenceScope: directChatScope,
        displayText: chatReply.trim(),
        action: '',
        instruction: '',
        ready: true,
        chatReply: chatReply.trim(),
        user: userMsg,
        assistant: assistantMsg,
        transcript: source === 'voice' ? content : undefined,
        source,
        contextUsage: chatPrepared.usage,
      },
      requestId: c.get('requestId'),
    });
  }

  let intent;
  try {
    intent = await deepseekWritingIntentFromMessages(apiKey, prepared.messages);
  } catch (e) {
    return handleAiError(c, e);
  }

  log('info', 'writing.intent', {
    documentId,
    dialect,
    mode: intent.mode,
    guide: intent.guide,
    referenceScope: intent.referenceScope,
    ready: intent.ready,
    requestId: c.get('requestId'),
  });

  if (intent.mode === 'guide' && intent.guide) {
    return c.json({
      ok: true,
      data: {
        mode: 'guide',
        guide: intent.guide,
        referenceScope: intent.referenceScope,
        displayText: intent.displayText?.trim() ?? '',
        action: '',
        instruction: '',
        ready: true,
        transcript: source === 'voice' ? content : undefined,
        source,
        contextUsage: prepared.usage,
      },
      requestId: c.get('requestId'),
    });
  }

  const scopedBlocks = buildWritingAssistantContextBlocks({
    chapterTitle,
    chapterContent: chapterContent || body.articleExcerpt?.trim() || '（本章尚无正文）',
    documentExcerpt,
    referenceScope: intent.referenceScope,
  });

  const basePayload = {
    mode: intent.mode,
    referenceScope: intent.referenceScope,
    displayText: intent.displayText,
    action: intent.action,
    instruction: intent.instruction,
    ready: intent.ready,
    transcript: source === 'voice' ? content : undefined,
    source,
    contextUsage: prepared.usage,
  };

  if (intent.mode === 'revise' && intent.ready) {
    return c.json({ ok: true, data: basePayload, requestId: c.get('requestId') });
  }

  if (intent.mode === 'revise' && !intent.ready) {
    return c.json({
      ok: true,
      data: {
        ...basePayload,
        action: intent.action || '润色',
      },
      requestId: c.get('requestId'),
    });
  }

  const persistChatExchange = (assistantContent: string) => {
    const userMsg = addWritingAssistantMessage({
      documentId,
      role: 'user',
      content,
      kind: 'chat',
    })!;
    const assistantMsg = addWritingAssistantMessage({
      documentId,
      role: 'assistant',
      content: assistantContent.trim(),
      kind: 'chat',
    })!;
    return { userMsg, assistantMsg, chatReply: assistantContent.trim() };
  };

  if (!intent.ready && intent.displayText.trim()) {
    const { userMsg, assistantMsg, chatReply } = persistChatExchange(intent.displayText);
    return c.json({
      ok: true,
      data: {
        ...basePayload,
        ready: false,
        displayText: chatReply,
        chatReply,
        user: userMsg,
        assistant: assistantMsg,
      },
      requestId: c.get('requestId'),
    });
  }

  let chatPrepared;
  try {
    chatPrepared = await prepareWritingChatContext({
      apiKey,
      documentId,
      document: prepared.document,
      allMessages: getWritingAssistantMessages(documentId),
      chapterBlock: scopedBlocks.chapterBlock,
      documentBlock: scopedBlocks.documentBlock,
      userMessage: content,
      dialect,
      contextSelection,
      referenceScope: intent.referenceScope,
    });
  } catch (e) {
    return handleAiError(c, e);
  }

  let chatReply: string;
  try {
    chatReply = await deepseekWritingChatFromMessages(apiKey, chatPrepared.messages);
  } catch (e) {
    return handleAiError(c, e);
  }

  const { userMsg, assistantMsg } = persistChatExchange(chatReply);
  // 修 review#1：回复+消息成功入库后才提交写作侧压缩产物
  commitPreparedWritingContext(documentId, chatPrepared);
  return c.json({
    ok: true,
    data: {
      ...basePayload,
      mode: 'chat',
      ready: true,
      displayText: chatReply.trim(),
      chatReply: chatReply.trim(),
      contextUsage: chatPrepared.usage,
      user: userMsg,
      assistant: assistantMsg,
    },
    requestId: c.get('requestId'),
  });
});

documentsRouter.post('/:id/assistant/messages', async (c) => {
  const documentId = c.req.param('id');
  const doc = getDocument(documentId);
  if (!doc) return jsonError(c, ErrorCodes.NOT_FOUND, 404);

  const body = await c.req.json<{
    content: string;
    articleExcerpt?: string;
    chapterId?: string;
    chapterTitle?: string;
    chapterContent?: string;
    documentExcerpt?: string;
    contextSelection?: import('@shiren/shared').ContextSelection;
    commitIntent?: {
      displayText: string;
      action: string;
      instruction: string;
    };
    contextUsage?: import('@shiren/shared').ContextUsage;
  }>();
  const content = body.content?.trim();
  if (!content) return jsonError(c, ErrorCodes.VALIDATION, 400);
  const commit = body.commitIntent;
  if (!commit?.displayText?.trim()) {
    return jsonError(c, ErrorCodes.VALIDATION, 400);
  }

  const userMsg = addWritingAssistantMessage({
    documentId,
    role: 'user',
    content,
    kind: 'chat',
  })!;

  const assistantMsg = addWritingAssistantMessage({
    documentId,
    role: 'assistant',
    content: stripWritingIntentDisplayText(commit.displayText.trim()),
    kind: 'intent_confirm',
    pendingAction: commit.action?.trim() || '润色',
    pendingInstruction: commit.instruction?.trim() || content,
    confirmStatus: 'pending',
  })!;

  return c.json({
    ok: true,
    data: {
      user: userMsg,
      assistant: assistantMsg,
      contextUsage: body.contextUsage,
    },
    requestId: c.get('requestId'),
  });
});

documentsRouter.post('/:id/assistant/confirm', async (c) => {
  const documentId = c.req.param('id');
  const doc = getDocument(documentId);
  if (!doc) return jsonError(c, ErrorCodes.NOT_FOUND, 404);

  const body = await c.req.json<{
    messageId: string;
    approved: boolean;
    blockId: string;
    articleExcerpt?: string;
    chapterId?: string;
    chapterTitle?: string;
    chapterContent?: string;
    documentExcerpt?: string;
    understandingScope?: 'chapter' | 'document';
  }>();

  const pending = getWritingAssistantMessage(documentId, body.messageId);
  if (!pending || pending.kind !== 'intent_confirm' || pending.confirmStatus !== 'pending') {
    return jsonError(c, ErrorCodes.ASSISTANT_INTENT_NOT_FOUND, 404);
  }

  let found = findBlock(doc, body.blockId);
  if (!found && body.chapterId) {
    const chapter = doc.chapters.find((ch) => ch.id === body.chapterId);
    const block = chapter?.blocks[0];
    if (chapter && block) found = { chapter, block };
  }
  if (!found) return jsonError(c, ErrorCodes.BLOCK_NOT_FOUND, 404);

  const dialect = replyDialectFromRequest(c);

  if (!body.approved) {
    const assistantMsg = updateWritingAssistantMessage(documentId, body.messageId, {
      confirmStatus: 'rejected',
    });
    if (!assistantMsg) {
      return jsonError(c, ErrorCodes.NOT_FOUND, 404);
    }
    return c.json({ ok: true, data: { assistant: assistantMsg }, requestId: c.get('requestId') });
  }

  let apiKey: string;
  try {
    apiKey = getDeepSeekKey(c);
  } catch (e) {
    return handleAiError(c, e);
  }

  updateWritingAssistantMessage(documentId, body.messageId, { confirmStatus: 'approved' });

  const action = pending.pendingAction || '润色';
  const instruction = pending.pendingInstruction || '';
  const oldText = found.block.content;
  const understandingScope: WritingUnderstandingScope =
    body.understandingScope === 'chapter' ? 'chapter' : 'document';

  const { messages: execMessages, usage: contextUsage } = prepareWritingExecuteContext({
    action,
    oldText,
    instruction,
    styleGuide: doc.styleGuide,
    dialect,
    chapterTitle: body.chapterTitle?.trim() || found.chapter.title,
    understandingScope,
    documentExcerpt: body.documentExcerpt?.trim(),
    documentContextSummary: doc.documentContextSummary,
  });

  let suggested: string;
  let comment: string;
  let executeBasis: WritingExecuteBasis;
  try {
    const parsed = await completeWritingExecuteRaw(apiKey, execMessages, {
      action,
      oldText,
      suggestedText: oldText,
      instruction,
      dialect,
    });
    executeBasis = ensureWritingExecuteBasis(parsed.basis, action);
    const isContinue = action === '续写';
    suggested = isContinue ? oldText + parsed.text : parsed.text;
    comment = writingDoneComment(action, dialect);
  } catch (e) {
    return handleAiError(c, e);
  }

  const revision = createRevision({
    documentId,
    blockId: body.blockId,
    parentRevisionId: found.block.currentRevisionId,
    snapshot: suggested,
    previousSnapshot: oldText,
    summary:
      action === '续写'
        ? `续写了${found.chapter.title}的一段`
        : `润色了${found.chapter.title}的一段`,
    source: 'ai',
    status: 'pending',
    suggestAction: action,
    suggestInstruction: instruction || undefined,
    suggestUnderstandingScope: understandingScope,
    suggestEvaluation: executeBasis.evaluation,
    suggestRationale: executeBasis.rationale,
  });

  addWritingAssistantMessage({
    documentId,
    role: 'assistant',
    content: assistantRevisionReadyLine(dialect),
    kind: 'revision_ready',
    revisionId: revision.id,
    suggestAction: action,
    suggestUnderstandingScope: understandingScope,
    suggestEvaluation: executeBasis.evaluation,
    suggestRationale: executeBasis.rationale,
  });

  return c.json({
    ok: true,
    data: {
      revision,
      oldText,
      newText: suggested,
      comment,
      contextUsage,
    },
    requestId: c.get('requestId'),
  });
});
