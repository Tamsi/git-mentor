import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { LLMConfig } from "@git-mentor/core";
import { listOllamaLocalModels, listOllamaCloudModels, isCloudTag } from "./model-config.js";
import { getOllamaAuthStatus, signInToOllama } from "./ollama-auth.js";

const execFileAsync = promisify(execFile);

const FALLBACK_MODELS = ["qwen3:8b", "gpt-oss:20b-cloud", "gpt-oss:120b-cloud"];

export interface OllamaReadyResult {
  model: string;
  changed: boolean;
}

/** Map ollama.com catalog names to the tag Ollama actually runs. */
export function resolveCloudModelTag(name: string): string {
  if (name.endsWith(":cloud") || name.endsWith("-cloud")) return name;
  if (name.includes(":")) return `${name}-cloud`;
  return `${name}:cloud`;
}

export function isCloudCatalogName(name: string, cloudNames: string[]): boolean {
  const base = name.replace(/:cloud$/, "").replace(/-cloud$/, "");
  return cloudNames.includes(name) || cloudNames.includes(base);
}

async function probeModel(model: string, baseUrl: string): Promise<boolean> {
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
    if (!response.ok) return false;
    const data = (await response.json()) as { error?: string; message?: { content?: string } };
    return !data.error && data.message != null;
  } catch {
    return false;
  }
}

async function registerCloudStub(model: string): Promise<void> {
  try {
    await execFileAsync("ollama", ["pull", model], { encoding: "utf8", timeout: 120_000 });
  } catch {
    // Probe decides whether the model is usable.
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function fallbackModels(local: string[]): string[] {
  const downloaded = local.filter((name) => !isCloudTag(name));
  const stubs = local.filter((name) => isCloudTag(name));
  return unique([...downloaded, ...FALLBACK_MODELS, ...stubs]);
}

/** Ensure the configured Ollama model is runnable; pick a working fallback if needed. */
export async function ensureOllamaModel(
  llm: LLMConfig,
  onStatus?: (message: string) => void,
): Promise<OllamaReadyResult> {
  const model = llm.model;
  const baseUrl = llm.baseUrl;

  const [local, cloudRemote] = await Promise.all([
    listOllamaLocalModels(baseUrl),
    listOllamaCloudModels(),
  ]);
  const candidates = unique([
    model,
    ...(isCloudCatalogName(model, cloudRemote) ? [resolveCloudModelTag(model)] : []),
  ]);

  for (const candidate of candidates) {
    if (await probeModel(candidate, baseUrl)) {
      return { model: candidate, changed: candidate !== model };
    }
  }

  if (isCloudCatalogName(model, cloudRemote)) {
    const cloudTag = resolveCloudModelTag(model);
    const auth = await getOllamaAuthStatus();
    if (!auth.signedIn) {
      onStatus?.("Signing in to Ollama for cloud models…");
      try {
        await signInToOllama({ onStatus, openBrowser: true });
      } catch {
        // Continue to fallbacks below.
      }
    }
    onStatus?.(`Connecting ${cloudTag}…`);
    await registerCloudStub(cloudTag);
    if (await probeModel(cloudTag, baseUrl)) {
      return { model: cloudTag, changed: cloudTag !== model };
    }
  }

  const fallbacks = fallbackModels(local);
  for (const fallback of fallbacks) {
    if (await probeModel(fallback, baseUrl)) {
      return { model: fallback, changed: fallback !== model };
    }
    if (isCloudTag(fallback)) {
      await registerCloudStub(fallback);
      if (await probeModel(fallback, baseUrl)) {
        return { model: fallback, changed: fallback !== model };
      }
    }
  }

  return { model, changed: false };
}
