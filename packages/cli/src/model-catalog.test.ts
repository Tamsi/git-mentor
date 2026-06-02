import { describe, expect, it } from "vitest";
import { buildModelPickerItems, formatPickerLabel, SIGNIN_VALUE } from "./model-catalog.js";

describe("buildModelPickerItems", () => {
  it("adds sign-in entry when cloud models exist and user is signed out", () => {
    const items = buildModelPickerItems({ local: ["qwen3:8b"], cloud: ["gpt-oss:120b"] }, false);
    expect(items[0]?.value).toBe(SIGNIN_VALUE);
    expect(items.map((item) => item.value)).toContain("gpt-oss:120b-cloud");
  });

  it("formats labels with hints", () => {
    expect(formatPickerLabel({ label: "qwen3:8b", value: "qwen3:8b", hint: "local" })).toBe(
      "qwen3:8b (local)",
    );
  });

  it("deduplicates cloud models already registered as local stubs", () => {
    const items = buildModelPickerItems(
      {
        local: ["qwen3:8b", "gpt-oss:120b-cloud"],
        cloud: ["gpt-oss:120b", "gpt-oss:20b"],
      },
      true,
    );
    const values = items.map((item) => item.value);
    expect(values.filter((value) => value === "gpt-oss:120b-cloud")).toHaveLength(1);
    expect(values).toContain("gpt-oss:20b-cloud");
  });

  it("labels cloud stubs as cloud, not local", () => {
    const items = buildModelPickerItems({ local: ["glm-5.1:cloud"], cloud: [] }, true);
    expect(items[0]?.hint).toBe("cloud");
  });
});
