export declare const ErrorCodes: {
    readonly NET_OFFLINE: "NET_OFFLINE";
    readonly NET_TIMEOUT: "NET_TIMEOUT";
    readonly AI_BUSY: "AI_BUSY";
    readonly AI_REFUSED: "AI_REFUSED";
    readonly ASR_EMPTY: "ASR_EMPTY";
    readonly OCR_FAIL: "OCR_FAIL";
    readonly FEISHU_AUTH: "FEISHU_AUTH";
    readonly SERVER_ERROR: "SERVER_ERROR";
    readonly NOT_FOUND: "NOT_FOUND";
    readonly ASSISTANT_INTENT_NOT_FOUND: "ASSISTANT_INTENT_NOT_FOUND";
    readonly BLOCK_NOT_FOUND: "BLOCK_NOT_FOUND";
    readonly REVISION_NOT_FOUND: "REVISION_NOT_FOUND";
    readonly REVISION_EXPIRED: "REVISION_EXPIRED";
    readonly VALIDATION: "VALIDATION";
    readonly API_KEY_MISSING: "API_KEY_MISSING";
    readonly ZENMUX_KEY_MISSING: "ZENMUX_KEY_MISSING";
    readonly DASHSCOPE_KEY_MISSING: "DASHSCOPE_KEY_MISSING";
};
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
//# sourceMappingURL=codes.d.ts.map