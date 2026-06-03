import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@git-mentor/core", () => ({
  WORKSPACES_DIR: path.join(os.tmpdir(), "git-mentor-test-workspaces"),
}));

import { WORKSPACES_DIR } from "@git-mentor/core";
import { assertRepoSlug, workspacePathFor } from "./workspace-path.js";

describe("workspace-path", () => {
  beforeEach(() => {
    fs.rmSync(WORKSPACES_DIR, { recursive: true, force: true });
    fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(WORKSPACES_DIR, { recursive: true, force: true });
  });

  it("rejects path traversal in owner", () => {
    expect(() => workspacePathFor("..", "repo")).toThrow();
  });

  it("resolves under workspaces root", () => {
    const p = workspacePathFor("octocat", "Hello-World");
    expect(p).toBe(path.join(WORKSPACES_DIR, "octocat", "Hello-World"));
  });

  it("rejects invalid slugs", () => {
    expect(() => assertRepoSlug("../x", "owner")).toThrow(/Invalid owner/);
  });
});
