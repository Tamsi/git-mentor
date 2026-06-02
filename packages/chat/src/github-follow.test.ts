import { describe, expect, it } from "vitest";
import { isFollowActionIntent, resolveFollowTargets } from "./github-follow.js";

const cached = [
  {
    username: "karpathy",
    url: "https://github.com/karpathy",
    relevanceReason: "ML",
  },
  {
    username: "simonw",
    url: "https://github.com/simonw",
    relevanceReason: "LLM tooling",
  },
];

describe("isFollowActionIntent", () => {
  it("detects natural follow requests", () => {
    expect(isFollowActionIntent("follow those profiles")).toBe(true);
    expect(isFollowActionIntent("follow them on github")).toBe(true);
    expect(isFollowActionIntent("follow @karpathy")).toBe(true);
  });

  it("ignores non-action phrasing", () => {
    expect(isFollowActionIntent("follow up on the PR")).toBe(false);
  });
});

describe("resolveFollowTargets", () => {
  it("resolves deictic references to cached /follow list", () => {
    expect(resolveFollowTargets("follow those profiles", cached)).toEqual(["karpathy", "simonw"]);
    expect(resolveFollowTargets("follow them", cached)).toEqual(["karpathy", "simonw"]);
  });

  it("resolves explicit usernames", () => {
    expect(resolveFollowTargets("follow @hwchase17 and jerryjliu", cached)).toEqual([
      "hwchase17",
      "jerryjliu",
    ]);
  });

  it("uses cached list for follow apply", () => {
    expect(resolveFollowTargets("follow apply", cached)).toEqual(["karpathy", "simonw"]);
  });
});
