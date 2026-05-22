export declare class ZenMuxError extends Error {
    status?: number | undefined;
    constructor(message: string, status?: number | undefined);
}
/** 识图识字（Gemini 多模态） */
export declare function zenmuxOcr(params: {
    apiKey: string;
    imageBase64: string;
    mimeType?: string;
    purpose?: string;
}): Promise<string>;
export declare function verifyZenMuxKey(apiKey: string): Promise<void>;
//# sourceMappingURL=zenmuxClient.d.ts.map