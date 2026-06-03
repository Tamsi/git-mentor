import { describe, expect, it } from "vitest";
import { formatDiscussionsListMarkdown } from "./discussions.js";

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
