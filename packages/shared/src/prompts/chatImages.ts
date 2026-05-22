/** 问答本轮带图：写入历史与上下文预算用的文字（不含图片二进制） */
export function chatStoredUserContent(params: {
  text: string;
  imageCount: number;
  imageOnlyFallback: string;
}): string {
  const trimmed = params.text.trim();
  const n = params.imageCount;
  if (n <= 0) return trimmed;
  const base = trimmed || params.imageOnlyFallback;
  return `${base}\n\n（本轮已上传 ${n} 张图片）`;
}

/** 送入上下文组装的 pending 用户话（不含图片，仅提示本轮有图） */
export function chatPendingUserForContext(text: string, imageCount: number): string {
  const trimmed = text.trim();
  if (imageCount <= 0) return trimmed;
  const suffix = `【本轮用户将上传 ${imageCount} 张图片；图片仅在本轮有效，不会进入后续对话历史。】`;
  return trimmed ? `${trimmed}\n\n${suffix}` : suffix;
}

/** 多模态请求里附在用户话前的说明 */
export function chatImageTurnLlmNotice(imageCount: number): string {
  return `【说明】用户在本轮上传了 ${imageCount} 张图片。请结合图片与下面的文字理解并回答。这些图片不会保存在后续对话上下文中，之后轮次请勿假设仍能看到图片。`;
}

export const CHAT_MAX_IMAGES_PER_MESSAGE = 6;

const CHAT_IMAGE_STORED_SUFFIX_RE = /\n\n（本轮已上传 \d+ 张图片）$/;

/** 用户气泡展示用文字（有预览图时去掉「已上传 N 张」后缀） */
export function chatUserBubbleDisplayText(message: {
  content: string;
  imagePreviewUris?: string[];
}): string {
  const hasPreview = (message.imagePreviewUris?.length ?? 0) > 0;
  const text = hasPreview
    ? message.content.replace(CHAT_IMAGE_STORED_SUFFIX_RE, '').trim()
    : message.content.trim();
  return text;
}
