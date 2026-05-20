import type { ReplyDialect } from './persona.js';
export declare function chatIntentPromptForDialect(dialect?: ReplyDialect | null): string;
export declare function formatChatIntentUserPayload(params: {
    recentLines: string[];
    currentContent: string;
    source: 'text' | 'voice';
}): string;
//# sourceMappingURL=chatIntent.d.ts.map