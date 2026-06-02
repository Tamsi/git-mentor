import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cliDist = path.join(root, "packages", "cli", "dist", "cli.js");
const isMonorepo = existsSync(path.join(root, "packages", "core", "src"));

const RUNTIME_DEPS = [
  "@octokit/rest@^21.1.1",
  "@modelcontextprotocol/sdk@^1.8.0",
  "yaml@^2.7.0",
  "zod@^3.24.0",
  "chalk@^5.4.1",
  "commander@^13.1.0",
];

function run(cmd, args, cwd = root) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
}

function hasCommand(cmd) {
  return spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;
}

function ensureBuilt() {
  if (existsSync(cliDist)) return;

  if (!isMonorepo) {
    console.error(
      "git-mentor: CLI bundle missing. Try reinstalling:\n  npm install -g git-mentor",
    );
    process.exit(1);
  }

  console.log("git-mentor: installing dependencies and building…");

  if (existsSync(path.join(root, "pnpm-lock.yaml")) && hasCommand("pnpm")) {
    if (!existsSync(path.join(root, "node_modules"))) {
      run("pnpm", ["install", "--ignore-scripts"]);
    }
    run("pnpm", ["build"]);
    return;
  }

  if (hasCommand("npm")) {
    if (!existsSync(path.join(root, "node_modules"))) {
      run("npm", ["install", "--ignore-scripts"]);
    }
    run("npm", ["run", "build"]);
    return;
  }

  console.error("git-mentor: install pnpm or npm, then run: pnpm install && pnpm build");
  process.exit(1);
}

function ensureRuntimeDeps() {
  if (isMonorepo) return;

  const markers = [
    path.join("node_modules", "yaml", "package.json"),
    path.join("node_modules", "commander", "package.json"),
    path.join("node_modules", "@octokit", "rest", "package.json"),
  ];
  if (markers.every((rel) => existsSync(path.join(root, rel)))) return;

  if (!hasCommand("npm")) {
    console.error("git-mentor: missing runtime dependencies. Reinstall with: npm install -g git-mentor");
    process.exit(1);
  }

  console.log("git-mentor: installing runtime dependencies…");
  run(
    "npm",
    ["install", ...RUNTIME_DEPS, "--omit=dev", "--no-package-lock", "--ignore-scripts"],
    root,
  );
}

try {
  if (process.env.GIT_MENTOR_SKIP_POSTINSTALL === "1") {
    process.exit(0);
  }

  if (isMonorepo && !existsSync(cliDist)) {
    ensureBuilt();
  }

  ensureRuntimeDeps();

  if (existsSync(cliDist)) {
    console.log("git-mentor: ready ✓");
  }
} catch (error) {
  console.error(`git-mentor postinstall failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
