#!/usr/bin/env node
/**
 * Non-interactive runner for all git-mentor chat slash commands.
 * Usage: node scripts/run-all-chat-commands.mjs [username]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../packages/core/dist/index.js";
import { ChatSession } from "../packages/chat/dist/index.js";

const args = process.argv.slice(2);
const modelFlag = args.find((a) => a.startsWith("--model="))?.slice(8);
const positional = args.filter((a) => !a.startsWith("--"));
const username = positional[0]?.replace(/^@/, "") || "Tamsi";
const model = modelFlag || process.env.GITMENTOR_AUDIT_MODEL || "gpt-oss:120b-cloud";

/** Read-only / safe variants — no GitHub writes */
const COMMANDS = [
  { cmd: "/help", label: "help" },
  { cmd: "/analyze", label: "analyze-help" },
  { cmd: "/analyze profile", label: "analyze-profile", slow: true },
  { cmd: "/role", label: "role-list" },
  { cmd: "/model", label: "model-status" },
  { cmd: "/gaps", label: "gaps" },
  { cmd: "/growth", label: "growth" },
  { cmd: "/trending", label: "trending", slow: true },
  { cmd: "/following", label: "following" },
  { cmd: "/followers", label: "followers" },
  { cmd: "/follow", label: "follow" },
  { cmd: "/discussions help", label: "discussions-help" },
  { cmd: "/discussions community", label: "discussions-community", slow: true },
  { cmd: "/discuss", label: "discuss-help" },
  { cmd: "/fork", label: "fork-usage" },
  { cmd: "/apply help", label: "apply-help" },
  { cmd: "/improve", label: "improve" },
  { cmd: "/export", label: "export" },
  { cmd: "/rules", label: "rules" },
  { cmd: "/skills", label: "skills" },
  { cmd: "/mcp", label: "mcp-list" },
  { cmd: "/auth", label: "auth-status" },
  { cmd: "/login", label: "login-info" },
  { cmd: "/signin", label: "signin-info" },
  { cmd: "/analyze git-mentor", label: "analyze-repo", slow: true },
  { cmd: "/quit", label: "quit" },
];

function classify(content, toolUsed) {
  if (content === "__EXIT__") return { status: "exit", ok: true };
  if (content.includes("Unknown command")) return { status: "unknown", ok: false };
  if (/failed|error|Could not|Invalid|unavailable/i.test(content) && !/LLM unavailable/i.test(content)) {
    return { status: "error", ok: false };
  }
  if (/gitmentor login|\/login|\/auth login|Run \*\*`\/analyze profile`\*\*/.test(content)) {
    return { status: "needs-setup", ok: true };
  }
  if (toolUsed) return { status: "ok", ok: true, toolUsed };
  return { status: "ok", ok: true };
}

function preview(text, max = 280) {
  const flat = text.replace(/\n+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
}

const config = loadConfig();
config.llm.model = model;
config.llm.provider = "ollama";
const session = new ChatSession(config, username, config.defaultRole);

console.log(`\n=== git-mentor command audit @${username} (model: ${model}) ===\n`);

const bootstrap = await session.bootstrap();
console.log(`[bootstrap] tool=${bootstrap.toolUsed ?? "—"} analysis=${bootstrap.analysis ? "yes" : "no"}`);
console.log(`  → ${preview(bootstrap.content)}\n`);

const results = [];

for (const { cmd, label, slow } of COMMANDS) {
  const start = Date.now();
  process.stdout.write(`Running ${cmd}…`);
  try {
    const reply = await session.handleInput(cmd, slow ? (msg) => process.stderr.write(` [${msg}]`) : undefined);
    const elapsed = Date.now() - start;
    const cls = classify(reply.content, reply.toolUsed);
    results.push({
      label,
      cmd,
      elapsedMs: elapsed,
      toolUsed: reply.toolUsed ?? null,
      contentLength: reply.content.length,
      ...cls,
      preview: preview(reply.content),
      content: reply.content,
    });
    process.stdout.write(` ${cls.status} (${elapsed}ms)\n`);
  } catch (err) {
    const elapsed = Date.now() - start;
    results.push({
      label,
      cmd,
      elapsedMs: elapsed,
      status: "exception",
      ok: false,
      preview: err instanceof Error ? err.message : String(err),
    });
    process.stdout.write(` exception (${elapsed}ms)\n`);
  }
}

console.log("\n=== Summary ===\n");
const ok = results.filter((r) => r.ok).length;
const fail = results.filter((r) => !r.ok).length;
console.log(`Total: ${results.length} | OK: ${ok} | Issues: ${fail}`);

for (const r of results) {
  const icon = r.ok ? "✓" : "✗";
  console.log(`${icon} ${r.label.padEnd(22)} ${r.status.padEnd(12)} ${String(r.elapsedMs).padStart(6)}ms  ${r.preview}`);
}


const outFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  `audit-${model.replace(/[:/]/g, "-")}-${username}.json`,
);
fs.writeFileSync(
  outFile,
  JSON.stringify({ model, username, bootstrap: bootstrap.content, results }, null, 2),
);
console.log(`\nFull report → ${outFile}\n`);
