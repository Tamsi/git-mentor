/**
 * Copy MCP server bundles into packages/cli/dist/mcp-servers for npm publish.
 * Run after tsup build (import.meta.url in bundled cli resolves to dist/).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliDist = path.join(__dirname, "..", "dist");
const repoRoot = path.resolve(__dirname, "..", "..", "..");

function copyMcpServerPackage(packageName, serverId) {
  const srcDist = path.join(repoRoot, "packages", packageName, "dist");
  const destDir = path.join(cliDist, "mcp-servers", serverId);
  fs.mkdirSync(destDir, { recursive: true });

  const entry = "mcp-github-server.js";
  const entrySrc = path.join(srcDist, entry);
  if (!fs.existsSync(entrySrc)) {
    throw new Error(`Missing ${entrySrc}. Run pnpm build in packages/${packageName} first.`);
  }

  for (const file of fs.readdirSync(srcDist)) {
    if (file.endsWith(".js") && (file === entry || file.startsWith("chunk-"))) {
      fs.copyFileSync(path.join(srcDist, file), path.join(destDir, file));
    }
  }
}

copyMcpServerPackage("github", "github");
console.log("git-mentor: staged MCP server → packages/cli/dist/mcp-servers/github/");
