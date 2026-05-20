import type { ErrorCode } from './codes.js';
export interface ErrorMessageEntry {
    message: string;
    hint: string;
    retryable: boolean;
}
export declare const errorMessages: Record<ErrorCode, ErrorMessageEntry>;
//# sourceMappingURL=messages.d.ts.map