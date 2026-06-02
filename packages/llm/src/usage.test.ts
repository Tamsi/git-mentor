import { describe, expect, it } from "vitest";
import { formatTokenCount, parseOllamaUsage } from "./usage.js";

describe("parseOllamaUsage", () => {
  it("parses prompt and completion counts", () => {
    expect(parseOllamaUsage({ prompt_eval_count: 842, eval_count: 156 })).toEqual({
      promptTokens: 842,
      completionTokens: 156,
      totalTokens: 998,
      source: "provider",
    });
  });
});

describe("formatTokenCount", () => {
  it("formats large counts compactly", () => {
    expect(formatTokenCount(40960)).toBe("41k");
    expect(formatTokenCount(842)).toBe("842");
  });
});
