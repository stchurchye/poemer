import type { ReplyDialect } from './persona.js';
export declare function historyCompactPromptForDialect(dialect?: ReplyDialect | null): string;
export declare function documentCompactPromptForDialect(_dialect?: ReplyDialect | null): string;
export declare function formatHistoryForCompact(messages: Array<{
    role: 'user' | 'assistant';
    content: string;
}>): string;
//# sourceMappingURL=contextCompact.d.ts.map