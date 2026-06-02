import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatOllamaModelCatalog,
  listOllamaModelCatalog,
  curateCloudModels,
  OLLAMA_CLOUD_CATALOG_URL,
  OLLAMA_CLOUD_RECOMMENDED,
  parseModelSpec,
} from "./model-config.js";

describe("parseModelSpec", () => {
  it("parses model name only", () => {
    expect(parseModelSpec("qwen3:8b")).toEqual({ model: "qwen3:8b" });
  });

  it("parses provider/model", () => {
    expect(parseModelSpec("ollama/qwen3:8b")).toEqual({
      provider: "ollama",
      model: "qwen3:8b",
    });
  });
});

describe("listOllamaModelCatalog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("merges local and cloud catalogs without duplicates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("11434")) {
          return {
            ok: true,
            json: async () => ({ models: [{ name: "qwen3:8b" }] }),
          };
        }
        if (url === OLLAMA_CLOUD_CATALOG_URL) {
          return {
            ok: true,
            json: async () => ({
              models: [{ name: "qwen3:8b" }, { name: "glm-5.1" }, { name: "gpt-oss:120b" }],
            }),
          };
        }
        return { ok: false, json: async () => ({}) };
      }),
    );

    const catalog = await listOllamaModelCatalog("http://127.0.0.1:11434");
    expect(catalog.local).toEqual(["qwen3:8b"]);
    expect(catalog.cloud).toEqual(["gpt-oss:120b"]);
  });

  it("returns full cloud catalog when allCloud is set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("11434")) {
          return { ok: true, json: async () => ({ models: [] }) };
        }
        if (url === OLLAMA_CLOUD_CATALOG_URL) {
          return {
            ok: true,
            json: async () => ({
              models: [{ name: "glm-5.1" }, { name: "gpt-oss:120b" }],
            }),
          };
        }
        return { ok: false, json: async () => ({}) };
      }),
    );

    const catalog = await listOllamaModelCatalog("http://127.0.0.1:11434", { allCloud: true });
    expect(catalog.cloud).toEqual(["glm-5.1", "gpt-oss:120b"]);
  });
});

describe("curateCloudModels", () => {
  it("keeps recommended order and skips local duplicates", () => {
    const remote = ["gpt-oss:20b", "gpt-oss:120b", "glm-5.1", "deepseek-v3.2"];
    expect(curateCloudModels(remote, ["gpt-oss:20b"])).toEqual(["gpt-oss:120b", "deepseek-v3.2"]);
    expect(OLLAMA_CLOUD_RECOMMENDED).toContain("gpt-oss:120b");
  });

  it("skips cloud entries when the runnable tag is already registered locally", () => {
    const remote = ["gpt-oss:120b", "gpt-oss:20b"];
    expect(curateCloudModels(remote, ["gpt-oss:120b-cloud", "qwen3:8b"])).toEqual(["gpt-oss:20b"]);
  });
});

describe("formatOllamaModelCatalog", () => {
  it("shows local and cloud sections", () => {
    const text = formatOllamaModelCatalog({
      local: ["qwen3:8b"],
      cloud: ["glm-5.1"],
    });
    expect(text).toContain("**Local**");
    expect(text).toContain("qwen3:8b");
    expect(text).toContain("**Cloud**");
    expect(text).toContain("glm-5.1");
    expect(text).toContain("ollama signin");
  });
});
