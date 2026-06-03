import type { GitMentorConfig, LLMConfig } from "@git-mentor/core";
import type { ChatMessage, ChatResult, StreamChatChunk } from "./types.js";
import { ensureOllamaModel } from "./ollama-runtime.js";
import { parseOllamaUsage } from "./usage.js";

export interface CompletionResult {
  content: string;
  provider: string;
  model: string;
}

export interface ProviderStatus {
  ok: boolean;
  provider: string;
  model: string;
  message: string;
}

export interface LLMProvider {
  id: string;
  complete(prompt: string, system?: string): Promise<CompletionResult>;
  chat(messages: ChatMessage[]): Promise<ChatResult>;
  chatStream?(messages: ChatMessage[]): AsyncGenerator<StreamChatChunk>;
  healthCheck(): Promise<ProviderStatus>;
}

class DeterministicProvider implements LLMProvider {
  id = "deterministic";

  async complete(_prompt?: string, _system?: string): Promise<CompletionResult> {
    return { content: "", provider: this.id, model: "rules-engine" };
  }

  async chat(messages: ChatMessage[]): Promise<ChatResult> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    return {
      content: this.fallbackReply(lastUser),
      provider: this.id,
      model: "rules-engine",
    };
  }

  private fallbackReply(input: string): string {
    const q = input.toLowerCase();
    if (q.includes("help") || q.startsWith("/")) {
      return [
        "I'm running in deterministic mode (no LLM). Available commands:",
        "  /analyze [@user] — refresh GitHub profile",
        "  /role <id> — set target role (ai-engineer, staff-engineer, …)",
        "  /gaps — show career gaps",
        "  /growth — show recommendations",
        "  /export — save dossier to disk",
        "  /quit — exit",
        "",
        "Connect Ollama or set GIT_MENTOR_LLM_PROVIDER for natural conversation.",
      ].join("\n");
    }
    return "I'm in deterministic mode. Use /help for commands, or configure an LLM (Ollama recommended) for free-form chat.";
  }

  async healthCheck(): Promise<ProviderStatus> {
    return { ok: true, provider: this.id, model: "rules-engine", message: "Deterministic mode always available" };
  }
}

class OllamaProvider implements LLMProvider {
  id = "ollama";

  constructor(private config: LLMConfig) {}

  private url(path: string): string {
    return this.config.baseUrl.replace(/\/$/, "") + path;
  }

  async complete(prompt: string, system?: string): Promise<CompletionResult> {
    const messages: ChatMessage[] = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    return this.chat(messages);
  }

  async chat(messages: ChatMessage[]): Promise<ChatResult> {
    const response = await fetch(this.url("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: false,
        options: { temperature: this.config.temperature },
      }),
    });
    const data = (await response.json()) as {
      message?: { content?: string };
      error?: string;
      prompt_eval_count?: number;
      eval_count?: number;
    };
    if (!response.ok || data.error) {
      const err = data.error ?? `HTTP ${response.status}`;
      if (/subscription/i.test(err)) {
        throw new Error(
          `Ollama error: ${err} — pick another model with /model or upgrade at https://ollama.com/upgrade`,
        );
      }
      throw new Error(`Ollama error: ${err}`);
    }
    return {
      content: data.message?.content ?? "",
      provider: this.id,
      model: this.config.model,
      usage: parseOllamaUsage(data),
    };
  }

  async *chatStream(messages: ChatMessage[]): AsyncGenerator<StreamChatChunk> {
    const response = await fetch(this.url("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: true,
        options: { temperature: this.config.temperature },
      }),
    });
    if (!response.ok) {
      throw new Error(`Ollama error: HTTP ${response.status}`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line) as {
            message?: { content?: string };
            done?: boolean;
            error?: string;
            prompt_eval_count?: number;
            eval_count?: number;
          };
          if (chunk.error) throw new Error(`Ollama error: ${chunk.error}`);
          const usage = chunk.done ? parseOllamaUsage(chunk) : undefined;
          yield {
            content: chunk.message?.content ?? "",
            done: Boolean(chunk.done),
            usage,
          };
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("Ollama error:")) throw error;
        }
      }
    }
    yield { content: "", done: true };
  }

  async healthCheck(): Promise<ProviderStatus> {
    try {
      const ready = await ensureOllamaModel(this.config);
      if (ready.changed) {
        this.config.model = ready.model;
      }
      return {
        ok: true,
        provider: this.id,
        model: ready.model,
        message: `Ollama ready (${ready.model})`,
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.id,
        model: this.config.model,
        message: error instanceof Error ? error.message : "Ollama unreachable",
      };
    }
  }
}

class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    private config: LLMConfig,
    public id: string,
  ) {}

  private baseUrl(): string {
    if (this.config.baseUrl) return this.config.baseUrl.replace(/\/$/, "");
    if (this.id === "openrouter") return "https://openrouter.ai/api/v1";
    return "https://api.openai.com/v1";
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;
    return headers;
  }

  async complete(prompt: string, system?: string): Promise<CompletionResult> {
    const messages: ChatMessage[] = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    return this.chat(messages);
  }

  async chat(messages: ChatMessage[]): Promise<ChatResult> {
    const response = await fetch(`${this.baseUrl()}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      }),
    });
    if (!response.ok) throw new Error(`${this.id} error: ${response.status}`);
    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const usage = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens ?? 0,
          completionTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
          source: "provider" as const,
        }
      : undefined;
    return {
      content: data.choices[0]?.message.content ?? "",
      provider: this.id,
      model: this.config.model,
      usage,
    };
  }

  async *chatStream(messages: ChatMessage[]): AsyncGenerator<StreamChatChunk> {
    const response = await fetch(`${this.baseUrl()}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream: true,
      }),
    });
    if (!response.ok) throw new Error(`${this.id} error: ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") {
          yield { content: "", done: true };
          return;
        }
        try {
          const chunk = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          yield {
            content: chunk.choices?.[0]?.delta?.content ?? "",
            done: false,
          };
        } catch {
          // skip
        }
      }
    }
    yield { content: "", done: true };
  }

  async healthCheck(): Promise<ProviderStatus> {
    if (!this.config.apiKey && ["openai", "openrouter", "anthropic"].includes(this.id)) {
      return { ok: false, provider: this.id, model: this.config.model, message: "API key missing" };
    }
    return { ok: true, provider: this.id, model: this.config.model, message: "Configured" };
  }
}

export class LLMRouter {
  constructor(private config: GitMentorConfig) {}

  getProvider(override?: LLMConfig): LLMProvider {
    const llm = override ?? this.config.llm;
    const provider = llm.provider.toLowerCase();
    if (provider === "ollama") return new OllamaProvider(llm);
    if (["openai", "openrouter", "anthropic", "gemini"].includes(provider)) {
      return new OpenAICompatibleProvider(llm, provider);
    }
    if (provider === "deterministic") return new DeterministicProvider();
    throw new Error(`Unsupported provider '${provider}'`);
  }

  async complete(prompt: string, system?: string): Promise<CompletionResult> {
    return this.chat(
      system
        ? [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ]
        : [{ role: "user", content: prompt }],
    );
  }

  async chat(messages: ChatMessage[]): Promise<ChatResult> {
    const provider = this.getProvider();
    const result = await provider.chat(messages);
    if (provider.id !== "deterministic" && !result.content.trim()) {
      return new DeterministicProvider().chat(messages);
    }
    return result;
  }

  async *chatStream(messages: ChatMessage[]): AsyncGenerator<StreamChatChunk> {
    const provider = this.getProvider();
    if (provider.chatStream) {
      yield* provider.chatStream(messages);
      return;
    }
    const result = await provider.chat(messages);
    yield { content: result.content, done: true };
  }

  async healthCheck(): Promise<ProviderStatus> {
    return this.getProvider().healthCheck();
  }
}

export { DeterministicProvider, OllamaProvider, OpenAICompatibleProvider };
export type { ChatMessage, ChatResult, StreamChatChunk };
