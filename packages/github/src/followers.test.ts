import { afterEach, describe, expect, it, vi } from "vitest";
import { formatFollowersListMarkdown, listFollowers } from "./followers.js";
import { GitHubRestClient } from "./github-rest.js";

describe("listFollowers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches authenticated user followers list", async () => {
    const rest = {
      getJson: vi.fn(async (url: string) => {
        if (url.endsWith("/user")) return { login: "octocat" };
        if (url.includes("/user/followers")) {
          return [{ login: "hubot", html_url: "https://github.com/hubot" }];
        }
        return [];
      }),
      token: () => "test-token",
    } as unknown as GitHubRestClient;

    const result = await listFollowers(rest);
    expect(result.username).toBe("octocat");
    expect(result.count).toBe(1);
    expect(result.followers[0]?.login).toBe("hubot");
  });
});

describe("formatFollowersListMarkdown", () => {
  it("formats markdown list", () => {
    const text = formatFollowersListMarkdown({
      username: "octocat",
      count: 1,
      followers: [{ login: "hubot", html_url: "https://github.com/hubot" }],
      truncated: false,
    });
    expect(text).toContain("Followers (1)");
    expect(text).toContain("hubot");
  });
});
