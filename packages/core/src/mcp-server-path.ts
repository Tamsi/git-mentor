import fs from "node:fs";
import path from "node:path";

/**
 * Resolve an MCP server entry script for npm publish (cli/dist/mcp-servers/…) or dev (package dist/).
 */
export function resolveMcpServerScript(
  moduleDir: string,
  serverId: string,
  entryFile: string,
): string {
  const npmLayout = path.join(moduleDir, "mcp-servers", serverId, entryFile);
  if (fs.existsSync(npmLayout)) return npmLayout;

  const packageLayout = path.join(moduleDir, entryFile);
  if (fs.existsSync(packageLayout)) return packageLayout;

  throw new Error(
    `MCP server "${serverId}" script missing (expected ${entryFile} under ${moduleDir}). Reinstall git-mentor.`,
  );
}
