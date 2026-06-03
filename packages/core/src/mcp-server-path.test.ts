import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveMcpServerScript } from "./mcp-server-path.js";

describe("resolveMcpServerScript", () => {
  const tmp = path.join(os.tmpdir(), `git-mentor-mcp-path-${process.pid}`);
  const moduleDir = path.join(tmp, "dist");

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("prefers npm publish layout under mcp-servers/", () => {
    const npmDir = path.join(moduleDir, "mcp-servers", "github");
    fs.mkdirSync(npmDir, { recursive: true });
    fs.writeFileSync(path.join(npmDir, "mcp-github-server.js"), "");
    expect(resolveMcpServerScript(moduleDir, "github", "mcp-github-server.js")).toBe(
      path.join(npmDir, "mcp-github-server.js"),
    );
  });

  it("falls back to package dist layout", () => {
    fs.mkdirSync(moduleDir, { recursive: true });
    fs.writeFileSync(path.join(moduleDir, "mcp-github-server.js"), "");
    expect(resolveMcpServerScript(moduleDir, "github", "mcp-github-server.js")).toBe(
      path.join(moduleDir, "mcp-github-server.js"),
    );
  });
});
