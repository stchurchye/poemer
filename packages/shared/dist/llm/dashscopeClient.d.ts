import { type QwenTtsDialect } from './qwenTts.js';
import type { ReplyDialect } from '../prompts/persona.js';
export declare class DashScopeError extends Error {
    status?: number | undefined;
    constructor(message: string, status?: number | undefined);
}
export declare function qwen3TtsSynthesize(opts: {
    apiKey: string;
    text: string;
    voice?: string;
    dialect?: QwenTtsDialect | string;
}): Promise<{
    audioUrl: string;
    audioBase64: string;
}>;
export declare function qwen3AsrTranscribe(opts: {
    apiKey: string;
    audioBase64: string;
    format: string;
    dialect?: ReplyDialect;
}): Promise<string>;
export declare function verifyDashScopeKey(apiKey: string): Promise<void>;
//# sourceMappingURL=dashscopeClient.d.ts.map