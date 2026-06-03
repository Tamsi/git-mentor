import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const required = [
  "cli.js",
  "mcp.js",
  "chat-cli.js",
  path.join("mcp-servers", "github", "mcp-github-server.js"),
];

for (const rel of required) {
  const full = path.join(dist, rel);
  if (!existsSync(full)) {
    console.error(`git-mentor publish check failed: missing dist/${rel}`);
    process.exit(1);
  }
}

console.log("git-mentor: publish bundle OK");
