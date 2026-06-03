import { afterEach, describe, expect, it, vi } from "vitest";
import { formatFollowingListMarkdown, listFollowing } from "./following.js";
import { GitHubRestClient } from "./github-rest.js";

describe("listFollowing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches authenticated user following list", async () => {
    const rest = {
      getJson: vi.fn(async (url: string) => {
        if (url.endsWith("/user")) return { login: "octocat" };
        if (url.includes("/user/following")) {
          return [
            { login: "karpathy", html_url: "https://github.com/karpathy", name: "Andrej" },
            { login: "simonw", html_url: "https://github.com/simonw" },
          ];
        }
        return [];
      }),
      token: () => "test-token",
    } as unknown as GitHubRestClient;

    const result = await listFollowing(rest);
    expect(result.username).toBe("octocat");
    expect(result.count).toBe(2);
    expect(result.following[0]?.login).toBe("karpathy");
  });

  it("formats markdown list", () => {
    const text = formatFollowingListMarkdown({
      username: "octocat",
      count: 1,
      following: [{ login: "karpathy", html_url: "https://github.com/karpathy" }],
      truncated: false,
    });
    expect(text).toContain("Following (1)");
    expect(text).toContain("karpathy");
  });
});
