/** 问答本轮带图：写入历史与上下文预算用的文字（不含图片二进制） */
export declare function chatStoredUserContent(params: {
    text: string;
    imageCount: number;
    imageOnlyFallback: string;
}): string;
/** 送入上下文组装的 pending 用户话（不含图片，仅提示本轮有图） */
export declare function chatPendingUserForContext(text: string, imageCount: number): string;
/** 多模态请求里附在用户话前的说明 */
export declare function chatImageTurnLlmNotice(imageCount: number): string;
export declare const CHAT_MAX_IMAGES_PER_MESSAGE = 6;
//# sourceMappingURL=chatImages.d.ts.map