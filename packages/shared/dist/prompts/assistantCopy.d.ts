import type { ReplyDialect } from './persona.js';
/** 写作小助手首条欢迎语 */
export declare function assistantWelcomeLine(dialect?: ReplyDialect | null): string;
export declare function assistantRejectConfirmLine(dialect?: ReplyDialect | null): string;
export declare function assistantWorkingLine(dialect?: ReplyDialect | null): string;
export declare function assistantRevisionReadyLine(dialect?: ReplyDialect | null): string;
export declare function writingDoneComment(action: string, dialect?: ReplyDialect | null): string;
export declare function writingRetryDoneComment(dialect?: ReplyDialect | null): string;
//# sourceMappingURL=assistantCopy.d.ts.map