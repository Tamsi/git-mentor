import type { GitMentorConfig } from "@git-mentor/core";
import { isCloudCatalogName, resolveCloudModelTag } from "./ollama-runtime.js";

export const LLM_PROVIDERS = [
  "ollama",
  "openai",
  "openrouter",
  "anthropic",
  "gemini",
  "deterministic",
] as const;

export type LlmProviderId = (typeof LLM_PROVIDERS)[number];

/** Official Ollama cloud catalog (no auth required for listing). */
export const OLLAMA_CLOUD_CATALOG_URL = "https://ollama.com/api/tags";

/** Short curated cloud list for the picker and `/model list` (free-tier friendly). */
export const OLLAMA_CLOUD_RECOMMENDED = [
  "gpt-oss:20b",
  "gpt-oss:120b",
  "deepseek-v3.1:671b",
  "qwen3-coder:480b",
  "deepseek-v3.2",
] as const;

export interface OllamaModelCatalog {
  local: string[];
  cloud: string[];
}

export function isCloudTag(name: string): boolean {
  return name.endsWith(":cloud") || name.endsWith("-cloud");
}

export function curateCloudModels(remote: string[], local: string[]): string[] {
  const localSet = new Set(local);
  return OLLAMA_CLOUD_RECOMMENDED.filter((name) => {
    if (!remote.includes(name)) return false;
    const runnable = resolveCloudModelTag(name);
    return !localSet.has(name) && !localSet.has(runnable);
  });
}

export function modelLabel(config: GitMentorConfig): string {
  return `${config.llm.provider}/${config.llm.model}`;
}

/** Parse `qwen3:8b` or `ollama/qwen3:8b` */
export function parseModelSpec(input: string): { provider?: string; model?: string } {
  const trimmed = input.trim();
  if (!trimmed) return {};

  const slash = trimmed.indexOf("/");
  if (slash > 0) {
    return {
      provider: trimmed.slice(0, slash),
      model: trimmed.slice(slash + 1),
    };
  }

  return { model: trimmed };
}

async function fetchOllamaTagNames(url: string): Promise<string[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = (await response.json()) as { models?: Array<{ name: string }> };
    return [...new Set(data.models?.map((m) => m.name).filter(Boolean) ?? [])].sort();
  } catch {
    return [];
  }
}

/** Models pulled / registered on the local Ollama daemon. */
export async function listOllamaLocalModels(baseUrl: string): Promise<string[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/tags`;
  return fetchOllamaTagNames(url);
}

/** Free cloud models hosted by ollama.com (runnable via local Ollama after `ollama signin`). */
export async function listOllamaCloudModels(): Promise<string[]> {
  return fetchOllamaTagNames(OLLAMA_CLOUD_CATALOG_URL);
}

/** @deprecated Use listOllamaModelCatalog instead. */
export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  return listOllamaLocalModels(baseUrl);
}

export async function listOllamaModelCatalog(
  baseUrl: string,
  options?: { allCloud?: boolean },
): Promise<OllamaModelCatalog> {
  const [local, remote] = await Promise.all([
    listOllamaLocalModels(baseUrl),
    listOllamaCloudModels(),
  ]);
  const localSet = new Set(local);
  const cloudRemote = remote.filter((name) => !localSet.has(name));
  const cloud = options?.allCloud ? cloudRemote : curateCloudModels(remote, local);
  return { local, cloud };
}

export function formatOllamaModelCatalog(catalog: OllamaModelCatalog): string {
  const lines: string[] = ["**Ollama models**", ""];

  if (catalog.local.length > 0) {
    lines.push("**Local** (downloaded on this machine)");
    lines.push("");
    lines.push(...catalog.local.map((m) => `- ${m}`));
    lines.push("");
  }

  if (catalog.cloud.length > 0) {
    lines.push("**Cloud** (recommended — free tier, no GPU required)");
    lines.push("");
    lines.push(...catalog.cloud.map((m) => `- ${m}`));
    lines.push("");
    lines.push(
      "Cloud models require **`ollama signin`**. Pick one with `/model` or `/model <name>`.",
    );
    lines.push("Full catalog: `/model list all` · https://ollama.com/search?c=cloud");
  }

  if (catalog.local.length === 0 && catalog.cloud.length === 0) {
    return "No Ollama models found. Is Ollama running? Try `ollama signin` for cloud models.";
  }

  if (catalog.local.length === 0 && catalog.cloud.length > 0) {
    lines.unshift(
      "No local models pulled yet. Cloud models still work after **`ollama signin`**.",
      "",
    );
  }

  return lines.join("\n").trimEnd();
}

export interface ModelCommandResult {
  message: string;
  changed: boolean;
}

export async function handleModelCommand(
  config: GitMentorConfig,
  args: string[],
): Promise<ModelCommandResult> {
  const joined = args.join(" ").trim();

  if (!joined) {
    return {
      changed: false,
      message: [
        `Current model: **${modelLabel(config)}**`,
        "",
        "Usage:",
        "- `/model <name>` — e.g. `/model qwen3:8b` or `/model glm-5.1`",
        "- `/model <provider>/<name>` — e.g. `/model ollama/qwen3:8b`",
        "- `/model provider <id>` — e.g. `/model provider openrouter`",
        "- `/model list` — recommended local + cloud models",
        "- `/model list all` — full Ollama cloud catalog",
        "- `/model` in chat — interactive picker (↑↓ Enter)",
        "",
        `Providers: ${LLM_PROVIDERS.join(", ")}`,
      ].join("\n"),
    };
  }

  if (joined.toLowerCase() === "list" || joined.toLowerCase() === "list all") {
    if (config.llm.provider !== "ollama") {
      return {
        changed: false,
        message: `Model listing is available for Ollama only. Current: **${modelLabel(config)}**`,
      };
    }
    const allCloud = joined.toLowerCase() === "list all";
    const catalog = await listOllamaModelCatalog(config.llm.baseUrl, { allCloud });
    return {
      changed: false,
      message: formatOllamaModelCatalog(catalog),
    };
  }

  if (args[0]?.toLowerCase() === "provider" && args[1]) {
    config.llm.provider = args[1];
    return {
      changed: true,
      message: `Provider set to **${config.llm.provider}** (model: **${config.llm.model}**)`,
    };
  }

  const spec = parseModelSpec(joined);
  if (spec.provider) config.llm.provider = spec.provider;
  if (spec.model) {
    const remote = await listOllamaCloudModels();
    config.llm.model = isCloudCatalogName(spec.model, remote)
      ? resolveCloudModelTag(spec.model)
      : spec.model;
  }

  return {
    changed: true,
    message: `Model set to **${modelLabel(config)}**`,
  };
}
