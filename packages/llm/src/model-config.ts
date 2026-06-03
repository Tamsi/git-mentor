import type { GitMentorConfig } from "@git-mentor/core";
import { markModelConfigured } from "@git-mentor/core";
import { getOllamaAuthStatus } from "./ollama-auth.js";
import {
  clearOllamaCloudAccessCache,
  readOllamaCloudAccessCache,
  writeOllamaCloudAccessCache,
  type OllamaCloudCacheScope,
} from "./ollama-cloud-cache.js";
import { isCloudCatalogName, isCloudTag, resolveCloudModelTag } from "./ollama-tags.js";

export const LLM_PROVIDERS = [
  "ollama",
  "openai",
  "openrouter",
  "anthropic",
  "gemini",
  "deterministic",
] as const;

export type LlmProviderId = (typeof LLM_PROVIDERS)[number];

/** Official Ollama cloud catalog (account subset when authenticated). */
export const OLLAMA_CLOUD_CATALOG_URL = "https://ollama.com/api/tags";

/** Minimum on-disk size (bytes) to treat a tag as a downloaded local model (not a cloud stub). */
export const OLLAMA_LOCAL_MIN_BYTES = 1_000_000;

/** Curated cloud models for the picker and `/model list` (filtered by account access). */
export const OLLAMA_CLOUD_RECOMMENDED = [
  "gpt-oss:20b",
  "gpt-oss:120b",
  "glm-5.1",
  "deepseek-v3.2",
  "deepseek-v3.1:671b",
  "qwen3-coder:480b",
  "deepseek-v4-flash:cloud",
] as const;

export interface OllamaTagModel {
  name: string;
  size?: number;
  remote_host?: string;
}

export interface OllamaModelCatalog {
  /** Models with weights on this machine (excludes cloud stubs). */
  local: string[];
  /** Cloud stubs already registered on the local daemon. */
  registeredCloud: string[];
  /** Account-accessible cloud catalog names (curated unless `allCloud`). */
  cloud: string[];
}

export { isCloudTag, resolveCloudModelTag, isCloudCatalogName } from "./ollama-tags.js";

export function isCloudStubTag(tag: OllamaTagModel): boolean {
  return Boolean(tag.remote_host) || isCloudTag(tag.name);
}

export function isDownloadedLocalTag(tag: OllamaTagModel): boolean {
  if (isCloudStubTag(tag)) return false;
  if (tag.size != null && tag.size < OLLAMA_LOCAL_MIN_BYTES) return false;
  return true;
}

export function curateCloudModels(
  accountRemote: string[],
  localDownloaded: string[],
  registeredCloud: string[],
): string[] {
  const localSet = new Set(localDownloaded);
  const registeredSet = new Set(registeredCloud);
  return OLLAMA_CLOUD_RECOMMENDED.filter((name) => {
    const catalogMatch =
      accountRemote.includes(name) ||
      accountRemote.includes(resolveCloudModelTag(name)) ||
      accountRemote.includes(name.replace(/:cloud$/, "").replace(/-cloud$/, ""));
    if (!catalogMatch) return false;
    const runnable = resolveCloudModelTag(name);
    return !localSet.has(name) && !localSet.has(runnable) && !registeredSet.has(runnable);
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

async function fetchOllamaTags(
  url: string,
  headers?: Record<string, string>,
): Promise<OllamaTagModel[]> {
  try {
    const response = await fetch(url, headers ? { headers } : undefined);
    if (!response.ok) return [];
    const data = (await response.json()) as { models?: OllamaTagModel[] };
    const models = data.models?.filter((m) => m.name) ?? [];
    return [...new Map(models.map((m) => [m.name, m])).values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  } catch {
    return [];
  }
}

async function fetchOllamaTagNames(
  url: string,
  headers?: Record<string, string>,
): Promise<string[]> {
  const tags = await fetchOllamaTags(url, headers);
  return tags.map((t) => t.name);
}

/** Models pulled / registered on the local Ollama daemon (all tags). */
export async function listOllamaLocalModelTags(baseUrl: string): Promise<OllamaTagModel[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/tags`;
  return fetchOllamaTags(url);
}

/** Downloaded weights on this machine (excludes cloud stubs). */
export async function listOllamaDownloadedModels(baseUrl: string): Promise<string[]> {
  const tags = await listOllamaLocalModelTags(baseUrl);
  return tags.filter(isDownloadedLocalTag).map((t) => t.name);
}

/** Cloud stubs registered on the local daemon (`remote_host` → ollama.com). */
export async function listOllamaRegisteredCloudStubs(baseUrl: string): Promise<string[]> {
  const tags = await listOllamaLocalModelTags(baseUrl);
  return tags.filter(isCloudStubTag).map((t) => t.name);
}

/** @deprecated Use listOllamaDownloadedModels — returns all local daemon tags. */
export async function listOllamaLocalModels(baseUrl: string): Promise<string[]> {
  return fetchOllamaTagNames(`${baseUrl.replace(/\/$/, "")}/api/tags`);
}

/** Public ollama.com catalog (not filtered by subscription). */
export async function listOllamaPublicCloudModels(): Promise<string[]> {
  return fetchOllamaTagNames(OLLAMA_CLOUD_CATALOG_URL);
}

export type CloudProbeResult = "ok" | "subscription" | "unavailable";

export async function probeCloudModelAccess(
  model: string,
  baseUrl: string,
): Promise<CloudProbeResult> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        stream: false,
        options: { num_predict: 1 },
      }),
    });
    const data = (await response.json()) as {
      error?: string;
      message?: { content?: string };
    };
    const err = data.error ?? "";
    if (/subscription/i.test(err)) return "subscription";
    if (!response.ok || err) return "unavailable";
    return data.message != null ? "ok" : "unavailable";
  } catch {
    return "unavailable";
  }
}

/** Probe cloud names via the local daemon (uses Ollama CLI sign-in, no API key). */
export async function probeAccessibleCloudCatalogNames(
  baseUrl: string,
  candidates: readonly string[] = OLLAMA_CLOUD_RECOMMENDED,
  options?: { concurrency?: number; onProgress?: (checked: number, total: number) => void },
): Promise<string[]> {
  const accessible: string[] = [];
  const concurrency = options?.concurrency ?? 4;
  const total = candidates.length;

  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (name) => {
        const tag = resolveCloudModelTag(name);
        const result = await probeCloudModelAccess(tag, baseUrl);
        if (result === "ok") accessible.push(name);
      }),
    );
    options?.onProgress?.(Math.min(i + batch.length, total), total);
  }

  return accessible.sort(
    (a, b) =>
      OLLAMA_CLOUD_RECOMMENDED.indexOf(a as (typeof OLLAMA_CLOUD_RECOMMENDED)[number]) -
      OLLAMA_CLOUD_RECOMMENDED.indexOf(b as (typeof OLLAMA_CLOUD_RECOMMENDED)[number]),
  );
}

export interface ListOllamaModelCatalogOptions {
  allCloud?: boolean;
  onStatus?: (message: string) => void;
}

/** Cloud models reachable on this machine after `ollama signin` (probed via local daemon). */
async function resolveAccountCloudNames(
  baseUrl: string,
  options?: ListOllamaModelCatalogOptions,
): Promise<string[]> {
  const auth = await getOllamaAuthStatus();
  if (!auth.signedIn) return [];

  const scope: OllamaCloudCacheScope = options?.allCloud ? "all" : "curated";
  const username = auth.username ?? "ollama-user";
  const cached = readOllamaCloudAccessCache(username, scope);
  if (cached) return cached;

  const candidates = options?.allCloud
    ? await listOllamaPublicCloudModels()
    : OLLAMA_CLOUD_RECOMMENDED;

  options?.onStatus?.(
    options.allCloud
      ? `Checking ${candidates.length} cloud models on your Ollama plan…`
      : "Checking recommended cloud models on your Ollama plan…",
  );

  const accessible = await probeAccessibleCloudCatalogNames(baseUrl, candidates, {
    concurrency: options?.allCloud ? 3 : 4,
    onProgress: (checked, total) => {
      if (total > 8) {
        options?.onStatus?.(`Checking cloud models (${checked}/${total})…`);
      }
    },
  });

  writeOllamaCloudAccessCache(username, scope, accessible);
  return accessible;
}

export { clearOllamaCloudAccessCache } from "./ollama-cloud-cache.js";

/** @deprecated Use listOllamaPublicCloudModels. */
export async function listOllamaCloudModels(): Promise<string[]> {
  return listOllamaPublicCloudModels();
}

/** @deprecated Use listOllamaModelCatalog instead. */
export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  return listOllamaDownloadedModels(baseUrl);
}

export async function listOllamaModelCatalog(
  baseUrl: string,
  options?: ListOllamaModelCatalogOptions,
): Promise<OllamaModelCatalog> {
  const [local, registeredCloud, accountRemote] = await Promise.all([
    listOllamaDownloadedModels(baseUrl),
    listOllamaRegisteredCloudStubs(baseUrl),
    resolveAccountCloudNames(baseUrl, options),
  ]);

  const cloud = options?.allCloud
    ? accountRemote.filter((name) => {
        const runnable = resolveCloudModelTag(name);
        return (
          !local.includes(name) &&
          !local.includes(runnable) &&
          !registeredCloud.includes(runnable)
        );
      })
    : curateCloudModels(accountRemote, local, registeredCloud);

  return { local, registeredCloud, cloud };
}

export function formatOllamaModelCatalog(catalog: OllamaModelCatalog): string {
  const lines: string[] = ["**Ollama models**", ""];

  if (catalog.local.length > 0) {
    lines.push("**Local** (downloaded on this machine)");
    lines.push("");
    lines.push(...catalog.local.map((m) => `- ${m}`));
    lines.push("");
  }

  if (catalog.registeredCloud.length > 0) {
    lines.push("**Cloud (on this machine)**");
    lines.push("");
    lines.push(...catalog.registeredCloud.map((m) => `- ${m}`));
    lines.push("");
  }

  if (catalog.cloud.length > 0) {
    lines.push("**Cloud** (your Ollama plan — via `ollama signin`)");
    lines.push("");
    lines.push(...catalog.cloud.map((m) => `- ${m}`));
    lines.push("");
    lines.push("Pick one with `/model` or `/model <name>`.");
    lines.push("More cloud models: `/model list all` (after sign-in)");
  }

  if (
    catalog.local.length === 0 &&
    catalog.cloud.length === 0 &&
    catalog.registeredCloud.length === 0
  ) {
    return [
      "No Ollama models found. Is Ollama running?",
      "",
      "Cloud models need **`gitmentor login ollama`** (or `/login ollama` in chat), then `/model list`.",
    ].join("\n");
  }

  if (catalog.local.length === 0 && catalog.cloud.length > 0) {
    lines.unshift(
      "No local weights pulled yet. Cloud models still work after **`ollama signin`**.",
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
        "- `/model list` — local + cloud models for your Ollama account",
        "- `/model list all` — full cloud list for your account",
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
    const remote = await listOllamaPublicCloudModels();
    config.llm.model = isCloudCatalogName(spec.model, remote)
      ? resolveCloudModelTag(spec.model)
      : spec.model;
    markModelConfigured(config);
  }

  if (spec.provider && !spec.model) {
    markModelConfigured(config);
  }

  return {
    changed: true,
    message: `Model set to **${modelLabel(config)}**`,
  };
}
