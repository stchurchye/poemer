import { type AssistantGuideKey } from './assistantGuideRegistry.js';
export type ParsedWritingIntent = {
    mode: 'chat' | 'revise' | 'guide';
    referenceScope: 'chapter' | 'document';
    displayText: string;
    action: string;
    instruction: string;
    ready: boolean;
    guide?: AssistantGuideKey;
};
/** 解析意图模型输出（支持正文 + 单行或多行 JSON） */
export declare function parseWritingIntentResponse(raw: string): ParsedWritingIntent;
/** 气泡展示用：去掉尾部 JSON，只保留确认话术 */
export declare function stripWritingIntentDisplayText(content: string): string;
//# sourceMappingURL=writingIntentParse.d.ts.map