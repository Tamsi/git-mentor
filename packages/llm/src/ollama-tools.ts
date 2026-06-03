/** Ollama-compatible tool definitions (OpenAI-style function schema). */
export interface OllamaToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

type OllamaApiMessage = {
  role: string;
  content: string;
  tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
};

export type OllamaToolExecutor = (
  name: string,
  args: Record<string, unknown>,
) => Promise<string>;

function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

export interface OllamaToolChatResult {
  content: string;
  toolCallsExecuted: string[];
}

/**
 * Chat with Ollama tool calling: runs tool rounds until the model returns text only.
 */
export async function runOllamaToolChat(params: {
  baseUrl: string;
  model: string;
  temperature: number;
  messages: OllamaApiMessage[];
  tools: OllamaToolDefinition[];
  executeTool: OllamaToolExecutor;
  maxRounds?: number;
  onToolStart?: (name: string) => void;
}): Promise<OllamaToolChatResult> {
  const apiMessages = [...params.messages];
  const executed: string[] = [];
  const maxRounds = params.maxRounds ?? 6;

  for (let round = 0; round < maxRounds; round++) {
    const response = await fetch(`${params.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: params.model,
        messages: apiMessages,
        tools: params.tools,
        stream: false,
        options: { temperature: params.temperature },
      }),
    });

    const data = (await response.json()) as {
      message?: {
        role?: string;
        content?: string;
        tool_calls?: Array<{
          function?: { name?: string; arguments?: unknown };
        }>;
      };
      error?: string;
    };

    if (!response.ok || data.error) {
      throw new Error(`Ollama error: ${data.error ?? `HTTP ${response.status}`}`);
    }

    const message = data.message;
    if (!message) throw new Error("Ollama returned an empty message.");

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return {
        content: (message.content ?? "").trim(),
        toolCallsExecuted: executed,
      };
    }

    apiMessages.push({
      role: "assistant",
      content: message.content ?? "",
      tool_calls: toolCalls.map((call) => ({
        function: {
          name: call.function?.name ?? "unknown",
          arguments: parseToolArguments(call.function?.arguments),
        },
      })),
    });

    for (const call of toolCalls) {
      const name = call.function?.name;
      if (!name) continue;
      const args = parseToolArguments(call.function?.arguments);
      params.onToolStart?.(name);
      const result = await params.executeTool(name, args);
      executed.push(name);
      apiMessages.push({ role: "tool", content: result });
    }
  }

  throw new Error("Too many tool-call rounds; try a simpler request or use /apply.");
}
