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
};

export interface ModelClient {
  complete(input: ModelCompletionInput): Promise<ModelCompletionResult>;
}
