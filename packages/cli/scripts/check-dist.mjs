import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");

if (!existsSync(dist)) {
  console.warn(
    "git-mentor: dist/ not found. From the repo root run:\n  pnpm install && pnpm build\n  npm install -g .",
  );
}
