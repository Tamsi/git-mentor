#!/usr/bin/env node
/**
 * Before/after benchmark for LLM-first analyze routes.
 * Usage: node scripts/compare-llm-first.mjs [username] [--model=gpt-oss:120b-cloud]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../packages/core/dist/index.js";
import { ChatSession } from "../packages/chat/dist/index.js";

const args = process.argv.slice(2);
const modelFlag = args.find((a) => a.startsWith("--model="))?.slice(8);
const username = args.find((a) => !a.startsWith("--"))?.replace(/^@/, "") || "Tamsi";
const llmModel = modelFlag || process.env.GITMENTOR_AUDIT_MODEL || "gpt-oss:120b-cloud";

const COMMANDS = [
  { key: "analyze-profile", cmd: "/analyze profile", llmImpact: "high" },
  { key: "analyze-repo", cmd: "/analyze git-mentor", llmImpact: "high" },
  { key: "gaps", cmd: "/gaps", llmImpact: "low" },
  { key: "growth", cmd: "/growth", llmImpact: "high" },
  { key: "improve", cmd: "/improve", llmImpact: "high" },
];

function excerpt(text, max = 600) {
  const flat = text.replace(/\n+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
}

function metrics(content) {
  const lower = content.toLowerCase();
  return {
    chars: content.length,
    citesRepo: /tamsi\/[\w-]+/i.test(content) || /git-mentor|ai-code-reviewer-mcp|redbee-mcp/i.test(content),
    mentionsMcp: /\bmcp\b/i.test(content),
    mentionsPins: /\bpin(ned|s)?\b/i.test(content),
    hallucinatedPins:
      /\b[1-9]\d*\s+pinned\b/i.test(content) ||
      (/\bpinned repos\b/i.test(content) && !/\b(0 pinned|no pinned|without pins)\b/i.test(content)),
    genericHabit: /recurring habit/i.test(content),
    hasSections: /^## /m.test(content),
  };
}

async function runMode(label, provider, model) {
  const config = loadConfig();
  config.llm.provider = provider;
  config.llm.model = model;

  const session = new ChatSession(config, username, config.defaultRole);
  await session.bootstrap();

  const rows = [];
  for (const { key, cmd, llmImpact } of COMMANDS) {
    const t0 = Date.now();
    const reply = await session.handleInput(cmd, (msg) => process.stderr.write(` [${label}:${msg}]`));
    rows.push({
      key,
      cmd,
      llmImpact,
      elapsedMs: Date.now() - t0,
      content: reply.content,
      excerpt: excerpt(reply.content),
      metrics: metrics(reply.content),
    });
    process.stderr.write("\n");
  }
  return { label, provider, model, rows };
}

console.log(`\n=== LLM-first before/after @${username} ===\n`);

const before = await runMode("BEFORE", "deterministic", "rules-engine");
console.log("\n--- switching to LLM mode ---\n");
const after = await runMode("AFTER", "ollama", llmModel);

console.log("\n=== COMPARISON ===\n");

for (const cmd of COMMANDS) {
  const b = before.rows.find((r) => r.key === cmd.key);
  const a = after.rows.find((r) => r.key === cmd.key);
  console.log(`## ${cmd.key} (expected LLM impact: ${cmd.llmImpact})`);
  console.log(`| | BEFORE (deterministic) | AFTER (${llmModel}) |`);
  console.log(`|---|---|---|`);
  console.log(`| Time | ${b.elapsedMs}ms | ${a.elapsedMs}ms |`);
  console.log(`| Length | ${b.metrics.chars} | ${a.metrics.chars} |`);
  console.log(`| Cites repos | ${b.metrics.citesRepo} | ${a.metrics.citesRepo} |`);
  console.log(`| MCP mention | ${b.metrics.mentionsMcp} | ${a.metrics.mentionsMcp} |`);
  console.log(`| Pin hallucination | ${b.metrics.hallucinatedPins} | ${a.metrics.hallucinatedPins} |`);
  console.log(`| Generic habit text | ${b.metrics.genericHabit} | ${a.metrics.genericHabit} |`);
  console.log(`| Markdown sections | ${b.metrics.hasSections} | ${a.metrics.hasSections} |`);
  console.log(`\n**BEFORE:** ${b.excerpt}\n`);
  console.log(`**AFTER:** ${a.excerpt}\n`);
  console.log("---\n");
}

const outPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  `compare-llm-first-${username}.json`,
);
fs.writeFileSync(
  outPath,
  JSON.stringify({ username, llmModel, before, after, generatedAt: new Date().toISOString() }, null, 2),
);
console.log(`Full report → ${outPath}\n`);
