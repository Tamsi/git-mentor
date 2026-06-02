export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  source: "provider" | "estimated";
}

export interface ChatResult {
  content: string;
  provider: string;
  model: string;
  usage?: LlmUsage;
}

export interface StreamChatChunk {
  content: string;
  done: boolean;
  usage?: LlmUsage;
}
