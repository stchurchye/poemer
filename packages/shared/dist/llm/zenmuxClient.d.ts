export type ZenMuxChatImage = {
    imageBase64: string;
    mimeType?: string;
};
export declare class ZenMuxError extends Error {
    status?: number | undefined;
    constructor(message: string, status?: number | undefined);
}
export type ZenMuxWebSearchOptions = {
    enabled: boolean;
    city?: string;
    country?: string;
    region?: string;
    timezone?: string;
};
/** 识图识字（Gemini 多模态） */
export declare function zenmuxOcr(params: {
    apiKey: string;
    imageBase64: string;
    mimeType?: string;
    purpose?: string;
}): Promise<string>;
/** 问答带图：在最后一轮用户话上附加图片（历史均为纯文本） */
export declare function zenmuxChatWithImages(params: {
    apiKey: string;
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    images: ZenMuxChatImage[];
    imageNotice: string;
}): Promise<string>;
/** 多轮纯文本对话（问问题回答，GPT-5.4） */
export declare function zenmuxCompleteMessages(params: {
    apiKey: string;
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    maxTokens?: number;
    temperature?: number;
    model?: string;
    webSearch?: ZenMuxWebSearchOptions;
}): Promise<string>;
export declare function verifyZenMuxKey(apiKey: string): Promise<void>;
//# sourceMappingURL=zenmuxClient.d.ts.map