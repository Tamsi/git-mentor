import type { ChatMessage, LlmUsage } from "./types.js";

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content) + 4, 0);
}

export function parseOllamaUsage(data: {
  prompt_eval_count?: number;
  eval_count?: number;
}): LlmUsage | undefined {
  const promptTokens = data.prompt_eval_count;
  const completionTokens = data.eval_count;
  if (promptTokens == null && completionTokens == null) return undefined;
  const prompt = promptTokens ?? 0;
  const completion = completionTokens ?? 0;
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: prompt + completion,
    source: "provider",
  };
}

export async function fetchOllamaContextLimit(
  model: string,
  baseUrl: string,
): Promise<number | undefined> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model }),
    });
    if (!response.ok) return undefined;
    const data = (await response.json()) as { model_info?: Record<string, unknown> };
    for (const [key, value] of Object.entries(data.model_info ?? {})) {
      if (key.endsWith(".context_length") && typeof value === "number") {
        return value;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1_000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}
