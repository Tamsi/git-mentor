import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatOllamaModelCatalog,
  listOllamaModelCatalog,
  curateCloudModels,
  isDownloadedLocalTag,
  isCloudStubTag,
  OLLAMA_CLOUD_RECOMMENDED,
  parseModelSpec,
} from "./model-config.js";

vi.mock("./ollama-auth.js", () => ({
  getOllamaAuthStatus: vi.fn(async () => ({ signedIn: true, username: "tester" })),
}));

vi.mock("./ollama-cloud-cache.js", () => ({
  readOllamaCloudAccessCache: vi.fn(() => null),
  writeOllamaCloudAccessCache: vi.fn(),
  clearOllamaCloudAccessCache: vi.fn(),
}));

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

describe("local vs cloud stub tags", () => {
  it("classifies downloaded weights and cloud stubs", () => {
    expect(isDownloadedLocalTag({ name: "qwen3:8b", size: 5_000_000_000 })).toBe(true);
    expect(isCloudStubTag({ name: "glm-5.1:cloud", remote_host: "https://ollama.com:443" })).toBe(
      true,
    );
    expect(isDownloadedLocalTag({ name: "glm-5.1:cloud", remote_host: "https://ollama.com:443" })).toBe(
      false,
    );
  });
});

describe("listOllamaModelCatalog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("merges downloaded local and sign-in-probed cloud", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("11434") && !url.includes("/api/chat")) {
          return {
            ok: true,
            json: async () => ({
              models: [
                { name: "qwen3:8b", size: 5_000_000_000 },
                { name: "gpt-oss:120b-cloud", remote_host: "https://ollama.com:443", size: 400 },
              ],
            }),
          };
        }
        if (url.includes("/api/chat")) {
          const body = JSON.parse(String(init?.body)) as { model: string };
          if (body.model === "gpt-oss:20b-cloud") {
            return { ok: true, json: async () => ({ message: { content: "ok" } }) };
          }
          return { ok: true, json: async () => ({ error: "unavailable" }) };
        }
        return { ok: false, json: async () => ({}) };
      }),
    );

    const catalog = await listOllamaModelCatalog("http://127.0.0.1:11434");
    expect(catalog.local).toEqual(["qwen3:8b"]);
    expect(catalog.registeredCloud).toEqual(["gpt-oss:120b-cloud"]);
    expect(catalog.cloud).toEqual(["gpt-oss:20b"]);
  });

  it("returns empty cloud when not signed in", async () => {
    const { getOllamaAuthStatus } = await import("./ollama-auth.js");
    vi.mocked(getOllamaAuthStatus).mockResolvedValueOnce({ signedIn: false });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("11434")) {
          return {
            ok: true,
            json: async () => ({ models: [{ name: "qwen3:8b", size: 5_000_000_000 }] }),
          };
        }
        return { ok: false, json: async () => ({}) };
      }),
    );

    const catalog = await listOllamaModelCatalog("http://127.0.0.1:11434");
    expect(catalog.cloud).toEqual([]);
    expect(catalog.local).toEqual(["qwen3:8b"]);
  });
});

describe("curateCloudModels", () => {
  it("keeps recommended order and skips local duplicates", () => {
    const remote = ["gpt-oss:20b", "gpt-oss:120b", "glm-5.1", "deepseek-v3.2"];
    expect(curateCloudModels(remote, ["gpt-oss:20b"], [])).toEqual([
      "gpt-oss:120b",
      "glm-5.1",
      "deepseek-v3.2",
    ]);
    expect(OLLAMA_CLOUD_RECOMMENDED).toContain("gpt-oss:120b");
  });

  it("skips cloud entries when the runnable tag is already registered locally", () => {
    const remote = ["gpt-oss:120b", "gpt-oss:20b"];
    expect(curateCloudModels(remote, [], ["gpt-oss:120b-cloud"])).toEqual(["gpt-oss:20b"]);
  });
});

describe("formatOllamaModelCatalog", () => {
  it("shows local and cloud sections without API key hints", () => {
    const text = formatOllamaModelCatalog({
      local: ["qwen3:8b"],
      registeredCloud: [],
      cloud: ["glm-5.1"],
    });
    expect(text).toContain("**Local**");
    expect(text).toContain("qwen3:8b");
    expect(text).toContain("**Cloud**");
    expect(text).toContain("glm-5.1");
    expect(text).toContain("ollama signin");
    expect(text).not.toContain("OLLAMA_API_KEY");
  });
});
