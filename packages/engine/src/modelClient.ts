import type { ModelTokenUsage } from '@shiren/shared';

export type ModelMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ModelCompletionInput = {
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
};

export type ModelCompletionResult = {
  text: string;
  /** 平台返回的真实 token 用量（拿得到时）；旧实现只返回 text 仍然合法 */
  usage?: ModelTokenUsage;
};

export type ModelStreamCallbacks = {
  /** 每段增量文本到达时回调（已是累加的「新增片段」，非全量） */
  onDelta: (chunk: string) => void;
  /** 取消流（用户退出/切会话）；透传到 fetch */
  signal?: AbortSignal;
};

export interface ModelClient {
  complete(input: ModelCompletionInput): Promise<ModelCompletionResult>;
  /**
   * 可选：流式补全。实现方逐段 onDelta，结束返回累加全文 + usage。
   * 不实现的 client（DeepSeek 等）由 streamChatMessages 自动降级为一次性 complete。
   */
  completeStream?(
    input: ModelCompletionInput,
    cb: ModelStreamCallbacks,
  ): Promise<ModelCompletionResult>;
}
