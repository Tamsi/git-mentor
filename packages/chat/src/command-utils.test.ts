import { describe, expect, it } from "vitest";
import { parseDiscussCreateInput } from "./command-utils.js";

describe("parseDiscussCreateInput", () => {
  it("parses owner/repo then title with spaces before pipe", () => {
    expect(
      parseDiscussCreateInput(
        "Tamsi/git-mentor Git Mentor discussion | Created by git mentor :p",
      ),
    ).toEqual({
      owner: "Tamsi",
      repo: "git-mentor",
      title: "Git Mentor discussion",
      body: "Created by git mentor :p",
    });
  });

  it("returns null without pipe separator", () => {
    expect(parseDiscussCreateInput("Tamsi/git-mentor Title only")).toBeNull();
  });
});
