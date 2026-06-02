import { describe, expect, it } from "vitest";
import { isCloudCatalogName, resolveCloudModelTag } from "./ollama-runtime.js";

describe("resolveCloudModelTag", () => {
  it("adds :cloud for simple names", () => {
    expect(resolveCloudModelTag("glm-5.1")).toBe("glm-5.1:cloud");
    expect(resolveCloudModelTag("deepseek-v4-flash")).toBe("deepseek-v4-flash:cloud");
  });

  it("adds -cloud for tagged names", () => {
    expect(resolveCloudModelTag("gpt-oss:120b")).toBe("gpt-oss:120b-cloud");
  });

  it("keeps already-resolved names", () => {
    expect(resolveCloudModelTag("gpt-oss:120b-cloud")).toBe("gpt-oss:120b-cloud");
    expect(resolveCloudModelTag("glm-5.1:cloud")).toBe("glm-5.1:cloud");
  });
});

describe("isCloudCatalogName", () => {
  const cloud = ["deepseek-v4-flash", "gpt-oss:120b"];

  it("matches catalog and resolved names", () => {
    expect(isCloudCatalogName("deepseek-v4-flash", cloud)).toBe(true);
    expect(isCloudCatalogName("deepseek-v4-flash:cloud", cloud)).toBe(true);
    expect(isCloudCatalogName("qwen3:8b", cloud)).toBe(false);
  });
});
