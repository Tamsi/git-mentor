import path from "node:path";
import { fileURLToPath } from "node:url";

/** Built MCP server entry (dist/mcp-github-server.js next to package index). */
export function githubMcpServerScriptPath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "mcp-github-server.js");
}
