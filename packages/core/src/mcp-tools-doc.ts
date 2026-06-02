import fs from "node:fs";
import { MCP_TOOLS_FILE } from "./config.js";

const MAX_INJECT_CHARS = 2_800;

/** Load GitHub + git-mentor MCP tools reference for system prompts. */
export function loadMcpToolsDoc(): string | null {
  if (!fs.existsSync(MCP_TOOLS_FILE)) return null;
  const content = fs.readFileSync(MCP_TOOLS_FILE, "utf8").trim();
  if (!content) return null;
  if (content.length <= MAX_INJECT_CHARS) return content;
  return `${content.slice(0, MAX_INJECT_CHARS)}\n\n… (see ${MCP_TOOLS_FILE} for full MCP tools reference)`;
}
