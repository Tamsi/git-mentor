import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMcpServerScript } from "@git-mentor/core";

function moduleDirForMcpResolve(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  if (dir.endsWith(`${path.sep}src`)) {
    return path.join(path.dirname(dir), "dist");
  }
  return dir;
}

/** MCP server entry — npm: cli/dist/mcp-servers/github/ ; dev: github/dist/ */
export function githubMcpServerScriptPath(): string {
  return resolveMcpServerScript(moduleDirForMcpResolve(), "github", "mcp-github-server.js");
}
