import { describe, expect, it } from "vitest";
import {
  createPromptHistoryState,
  navigatePromptHistory,
  recordPromptSubmission,
} from "./prompt-history.js";

describe("prompt history", () => {
  it("records submissions and skips consecutive duplicates", () => {
    let state = createPromptHistoryState();
    state = recordPromptSubmission(state, "/help");
    state = recordPromptSubmission(state, "/help");
    state = recordPromptSubmission(state, "hello");

    expect(state.entries).toEqual(["/help", "hello"]);
  });

  it("navigates up through history and restores draft on down", () => {
    let state = createPromptHistoryState();
    state = recordPromptSubmission(state, "first");
    state = recordPromptSubmission(state, "second");

    let current = "draft line";
    ({ state, input: current } = navigatePromptHistory(state, current, "up"));
    expect(current).toBe("second");

    ({ state, input: current } = navigatePromptHistory(state, current, "up"));
    expect(current).toBe("first");

    ({ state, input: current } = navigatePromptHistory(state, current, "down"));
    expect(current).toBe("second");

    ({ state, input: current } = navigatePromptHistory(state, current, "down"));
    expect(current).toBe("draft line");
    expect(state.index).toBeNull();
  });

  it("ignores navigation when history is empty", () => {
    const state = createPromptHistoryState();
    const result = navigatePromptHistory(state, "typing", "up");
    expect(result.input).toBe("typing");
    expect(result.state).toBe(state);
  });
});
