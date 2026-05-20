import type { ReplyDialect } from './persona.js';
/** 产品操作引导意图（写作小助手 / 问问题 共用） */
export declare const ASSISTANT_GUIDE_KEYS: readonly ["settings_font", "settings_voice", "settings_dialect", "writing_new_doc", "writing_switch_doc", "writing_share", "writing_rename", "writing_history", "chat_switch_topic"];
export type AssistantGuideKey = (typeof ASSISTANT_GUIDE_KEYS)[number];
export declare function isAssistantGuideKey(value: unknown): value is AssistantGuideKey;
export declare function assistantGuideRulesForDialect(dialect?: ReplyDialect | null): string;
//# sourceMappingURL=assistantGuideRegistry.d.ts.map