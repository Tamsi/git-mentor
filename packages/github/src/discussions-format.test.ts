import { describe, expect, it } from "vitest";
import {
  formatDiscussionsListMarkdown,
  parseRepoFromDiscussionSearchQuery,
} from "./discussions.js";

describe("parseRepoFromDiscussionSearchQuery", () => {
  it("extracts owner/repo from search query", () => {
    expect(parseRepoFromDiscussionSearchQuery("repo:community/community sort:updated-desc")).toEqual({
      owner: "community",
      repo: "community",
    });
  });

  it("returns null when no repo qualifier", () => {
    expect(parseRepoFromDiscussionSearchQuery("copilot is:open")).toBeNull();
  });
});

describe("formatDiscussionsListMarkdown", () => {
  it("renders thread links", () => {
    const md = formatDiscussionsListMarkdown({
      owner: "community",
      repo: "community",
      discussions: [
        {
          number: 1,
          title: "Hello",
          url: "https://github.com/orgs/community/discussions/1",
          author: "octocat",
        },
      ],
    });
    expect(md).toContain("#1 Hello");
    expect(md).toContain("octocat");
  });
});
