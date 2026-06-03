import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { LLMConfig } from "@git-mentor/core";
import {
  listOllamaDownloadedModels,
  listOllamaPublicCloudModels,
  probeAccessibleCloudCatalogNames,
} from "./model-config.js";
import { getOllamaAuthStatus, signInToOllama } from "./ollama-auth.js";
import { isCloudCatalogName, isCloudTag, resolveCloudModelTag } from "./ollama-tags.js";

export { isCloudCatalogName, resolveCloudModelTag } from "./ollama-tags.js";

const execFileAsync = promisify(execFile);

const FALLBACK_MODELS = ["gpt-oss:20b-cloud", "qwen3:8b", "gpt-oss:120b-cloud"];

export interface OllamaReadyResult {
  model: string;
  changed: boolean;
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

async function fallbackModels(baseUrl: string, local: string[]): Promise<string[]> {
  const auth = await getOllamaAuthStatus();
  const probed =
    auth.signedIn ? await probeAccessibleCloudCatalogNames(baseUrl) : [];
  const cloudTags = probed.map((name) => resolveCloudModelTag(name));
  return unique([...local, ...FALLBACK_MODELS, ...cloudTags]);
}

export interface EnsureOllamaModelOptions {
  /**
   * When true (user picked a model via `/model` or config), do not replace it with another
   * fallback model if probing fails — only normalize cloud tags (e.g. `name` → `name:cloud`).
   */
  respectUserChoice?: boolean;
}

/** Ensure the configured Ollama model is runnable; pick a working fallback if needed. */
export async function ensureOllamaModel(
  llm: LLMConfig,
  onStatus?: (message: string) => void,
  options?: EnsureOllamaModelOptions,
): Promise<OllamaReadyResult> {
  const respectUserChoice = options?.respectUserChoice ?? false;
  const model = llm.model;
  const baseUrl = llm.baseUrl;

  const [local, cloudRemote] = await Promise.all([
    listOllamaDownloadedModels(baseUrl),
    listOllamaPublicCloudModels(),
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

  if (respectUserChoice) {
    onStatus?.(
      `Model **${model}** is not reachable. Run \`gitmentor login ollama\` (or \`/login ollama\` in chat), then retry.`,
    );
    return { model, changed: false };
  }

  const fallbacks = await fallbackModels(baseUrl, local);
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
