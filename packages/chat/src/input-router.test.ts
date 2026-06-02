import { describe, expect, it } from "vitest";
import { routeInput } from "./input-router.js";
import { isFollowActionIntent } from "./github-follow.js";

describe("routeInput", () => {
  it("routes follow those profiles to github-action before chat", () => {
    const route = routeInput("follow those profiles", {
      hasProfile: true,
      tryGitHubAction: (input) => {
        expect(input).toBe("follow those profiles");
        expect(isFollowActionIntent(input)).toBe(true);
        return Promise.resolve({ content: "ok" });
      },
    });

    expect(route.kind).toBe("github-action");
  });
});
