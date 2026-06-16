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

export interface ModelClient {
  complete(input: ModelCompletionInput): Promise<ModelCompletionResult>;
}
