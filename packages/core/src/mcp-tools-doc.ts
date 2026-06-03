import fs from "node:fs";
import { MCP_TOOLS_FILE } from "./config.js";

/** Full tools.md can be ~10k chars; keep enough for §2 GitHub tools + §4 routing. */
const MAX_INJECT_CHARS = 12_000;

/** Load GitHub + git-mentor MCP tools reference for system prompts. */
export function loadMcpToolsDoc(): string | null {
  if (!fs.existsSync(MCP_TOOLS_FILE)) return null;
  const content = fs.readFileSync(MCP_TOOLS_FILE, "utf8").trim();
  if (!content) return null;
  if (content.length <= MAX_INJECT_CHARS) return content;
  return `${content.slice(0, MAX_INJECT_CHARS)}\n\n… (see ${MCP_TOOLS_FILE} for full MCP tools reference)`;
}
