import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubRestClient } from "./github-rest.js";
import { GitHubWriteClient } from "./github-write.js";

describe("GitHubWriteClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("updateUserProfile PATCHes /user with provided fields", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.github.com/user");
      expect(init?.method).toBe("PATCH");
      const body = JSON.parse(String(init?.body)) as { bio: string };
      expect(body.bio).toBe("AI engineer · OSS");
      return new Response(JSON.stringify({ bio: body.bio }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const rest = new GitHubRestClient(() => "ghp_test");
    const write = new GitHubWriteClient(rest);
    const result = await write.updateUserProfile({ bio: "AI engineer · OSS" });
    expect(result).toEqual({ bio: "AI engineer · OSS" });
  });

  it("upsertRepositoryFile includes sha when file exists", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "GET" || !init?.method) {
        return new Response(JSON.stringify({ sha: "abc123" }), { status: 200 });
      }
      expect(init.method).toBe("PUT");
      const body = JSON.parse(String(init.body)) as { sha: string; message: string };
      expect(body.sha).toBe("abc123");
      expect(body.message).toBe("Update README via gitmentor");
      return new Response(JSON.stringify({ commit: { sha: "def456" } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const rest = new GitHubRestClient(() => "ghp_test");
    const write = new GitHubWriteClient(rest);
    await write.upsertRepositoryFile({
      owner: "octocat",
      repo: "octocat",
      path: "README.md",
      content: "# Hello",
      message: "Update README via gitmentor",
    });
    expect(fetchMock).toHaveBeenCalled();
  });
});
