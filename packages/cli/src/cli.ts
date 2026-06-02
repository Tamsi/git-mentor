#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { AnalysisPipeline } from "@git-mentor/agents";
import {
  CONFIG_FILE,
  ensureDirs,
  listRoles,
  loadConfig,
  renderMarkdown,
  REPORTS_DIR,
  saveConfig,
} from "@git-mentor/core";
import { LLMRouter } from "@git-mentor/llm";
import chalk from "chalk";
import { Command } from "commander";
import { theme } from "./ui/theme.js";

const program = new Command();

async function resolveUsername(username: string, config: ReturnType<typeof loadConfig>): Promise<string> {
  if (!["me", "self", "@me"].includes(username)) {
    return username.replace(/^@/, "");
  }

  if (config.github.token) {
    const response = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${config.github.token}` },
    });
    if (!response.ok) throw new Error("Could not resolve GitHub user from token.");
    const data = (await response.json()) as { login: string };
    return data.login;
  }

  try {
    return execSync("gh api user -q .login", { encoding: "utf8" }).trim();
  } catch {
    throw new Error("Could not resolve your GitHub username. Run `gitmentor auth` or pass @username.");
  }
}

function persistResult(
  result: Awaited<ReturnType<AnalysisPipeline["run"]>>,
  mdPath?: string,
  jsonPath?: string,
): void {
  ensureDirs();
  const markdown = renderMarkdown(result);

  if (jsonPath) {
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
    console.log(chalk.green(`JSON → ${jsonPath}`));
  } else {
    fs.writeFileSync(path.join(REPORTS_DIR, `${result.profile.username}.json`), JSON.stringify(result, null, 2));
  }

  const targetMd = mdPath ?? path.join(REPORTS_DIR, `${result.profile.username}.md`);
  fs.writeFileSync(targetMd, markdown);
  console.log(chalk.green(`Report → ${targetMd}`));
}

function printSummary(result: Awaited<ReturnType<AnalysisPipeline["run"]>>): void {
  const { profile } = result;
  console.log(chalk.bold.cyan(`\n@${profile.username}`));
  console.log(profile.summary);
  console.log(
    chalk.dim(
      `Maturity: ${profile.maturityScore}/10 · Repos: ${profile.repoCount} · Stars: ${profile.totalStars}\n`,
    ),
  );
  for (const skill of profile.skills.slice(0, 8)) {
    console.log(`  ${skill.name.padEnd(14)} ${skill.level.padEnd(12)} ${skill.score}/10 (${skill.confidence})`);
  }
}

async function launchChat(
  username = "me",
  opts: { role?: string; deterministic?: boolean } = {},
): Promise<void> {
  const config = loadConfig();
  const resolved =
    !["me", "self", "@me"].includes(username)
      ? username.replace(/^@/, "")
      : await resolveUsername(username, config);
  const { runChatCli } = await import("./chat-cli.js");
  await runChatCli({
    username: resolved,
    roleId: opts.role,
    deterministic: opts.deterministic,
  });
}

program
  .name("gitmentor")
  .description("Evidence-backed GitHub career intelligence — local-first CLI.")
  .argument("[username]", "GitHub username (default: you)", "me")
  .option("--role, -r <role>", "Target role id")
  .option("--deterministic", "Run without LLM")
  .action(async (username: string, opts: { role?: string; deterministic?: boolean }) => {
    await launchChat(username, opts);
  });

program
  .command("init")
  .option("--provider <provider>", "LLM provider", "ollama")
  .option("--model <model>", "Model name", "qwen3:8b")
  .option("--base-url <url>", "LLM base URL", "http://localhost:11434")
  .option("--role <role>", "Default target role", "ai-engineer")
  .action((opts: { provider: string; model: string; baseUrl: string; role: string }) => {
    ensureDirs();
    const config = loadConfig();
    config.llm.provider = opts.provider;
    config.llm.model = opts.model;
    config.llm.baseUrl = opts.baseUrl;
    config.defaultRole = opts.role;
    saveConfig(config);
    console.log(chalk.green(`Config written to ${CONFIG_FILE}`));
  });

program.command("auth").action(() => {
  try {
    const status = execSync("gh auth status", { encoding: "utf8" });
    console.log(chalk.green(status.trim()));
    return;
  } catch {
    // fall through
  }
  const config = loadConfig();
  if (config.github.token) {
    console.log(chalk.green("GitHub token found in config/env."));
  } else {
    console.log(chalk.yellow("No GitHub auth detected."));
    console.log("  1. Run gh auth login");
    console.log("  2. Export GIT_MENTOR_GITHUB_TOKEN");
    console.log("  3. gitmentor analyze @username");
  }
});

program.command("roles").action(() => {
  for (const role of listRoles()) {
    console.log(`${chalk.bold(role.id.padEnd(20))} ${role.name} — ${role.description}`);
  }
});

program
  .command("analyze [username]")
  .option("--role, -r <role>", "Target role id")
  .option("--public", "Public profile (explicit, no auth needed)")
  .option("--deterministic", "Skip LLM")
  .option("-o, --output <path>", "Markdown output path")
  .option("--json <path>", "JSON output path")
  .action(async (username = "me", opts: { role?: string; public?: boolean; deterministic?: boolean; output?: string; json?: string }) => {
    const config = loadConfig();
    if (opts.deterministic) config.llm.provider = "deterministic";
    const resolved =
      opts.public || !["me", "self", "@me"].includes(username)
        ? username.replace(/^@/, "")
        : await resolveUsername(username, config);
    console.log(chalk.bold(`Analyzing @${resolved}...`));
    const result = await new AnalysisPipeline(config).run({ username: resolved, roleId: opts.role ?? config.defaultRole });
    printSummary(result);
    persistResult(result, opts.output, opts.json);
  });

program
  .command("coach [username]")
  .option("--role, -r <role>", "Target role id", "ai-engineer")
  .option("-o, --output <path>", "Markdown output path")
  .action(async (username = "me", opts: { role?: string; output?: string }) => {
    const config = loadConfig();
    const resolved = await resolveUsername(username, config);
    const result = await new AnalysisPipeline(config).run({
      username: resolved,
      roleId: opts.role,
      includeCoach: true,
      includeGrowth: false,
    });
    if (result.gapAnalysis) {
      console.log(chalk.bold(`\nGap Analysis — ${opts.role}`));
      console.log(result.gapAnalysis.summary);
      for (const gap of result.gapAnalysis.gaps) {
        console.log(`- ${chalk.bold(gap.area)}: ${gap.rationale}`);
      }
    }
    persistResult(result, opts.output);
  });

program
  .command("growth [username]")
  .option("--role, -r <role>", "Target role id", "ai-engineer")
  .option("--top <n>", "Number of recommendations", "5")
  .action(async (username = "me", opts: { role?: string; top?: string }) => {
    const config = loadConfig();
    const resolved = await resolveUsername(username, config);
    const result = await new AnalysisPipeline(config).run({ username: resolved, roleId: opts.role });
    for (const rec of result.actionPlan?.recommendations.slice(0, Number(opts.top ?? 5)) ?? []) {
      console.log(`- ${chalk.bold(rec.title)} [${rec.effort}] — ${rec.description}`);
    }
  });

program
  .command("export [username]")
  .requiredOption("-o, --output <path>", "Markdown output path")
  .option("--role, -r <role>", "Target role id")
  .action(async (username = "me", opts: { role?: string; output: string }) => {
    const config = loadConfig();
    const resolved = await resolveUsername(username, config);
    const result = await new AnalysisPipeline(config).run({ username: resolved, roleId: opts.role ?? config.defaultRole });
    fs.mkdirSync(path.dirname(opts.output), { recursive: true });
    fs.writeFileSync(opts.output, renderMarkdown(result));
    console.log(chalk.green(`Exported ${opts.output}`));
  });

program.command("doctor").action(async () => {
  const ok = (label: string) => console.log(`${theme.muted(label)} ${theme.success("✓")}`);
  const warn = (label: string) => console.log(`${theme.muted(label)} ${theme.brand("!")}`);

  if (fs.existsSync(CONFIG_FILE)) ok(`Config  ${CONFIG_FILE}`);
  else warn(`Config  ${CONFIG_FILE} (missing — run gitmentor init)`);

  try {
    execSync("gh auth status", { stdio: "ignore" });
    ok("GitHub  gh CLI authenticated");
  } catch {
    const config = loadConfig();
    if (config.github.token) ok("GitHub  token configured");
    else warn("GitHub  no auth (run gitmentor auth)");
  }

  const config = loadConfig();
  const status = await new LLMRouter(config).healthCheck();
  if (status.ok) ok(`LLM     ${config.llm.provider} — ${status.message}`);
  else warn(`LLM     ${config.llm.provider} — ${status.message}`);
});

program
  .command("model [spec]")
  .description("Pick or set the LLM model (persisted to config)")
  .option("--list", "List Ollama models (plain text)")
  .option("--signin", "Sign in to Ollama for cloud models")
  .option("--provider <provider>", "Set LLM provider")
  .action(async (spec: string | undefined, opts: { list?: boolean; signin?: boolean; provider?: string }) => {
    const config = loadConfig();

    if (opts.signin || spec?.toLowerCase() === "signin") {
      const { runOllamaSignIn } = await import("./model-picker.js");
      const result = await runOllamaSignIn(config);
      console.log(result.message.replace(/\*\*/g, ""));
      return;
    }

    if (!spec && !opts.list && !opts.provider && config.llm.provider === "ollama") {
      const { runModelPicker } = await import("./model-picker.js");
      const result = await runModelPicker(config);
      if (result.changed) {
        console.log(theme.success("Model updated"));
      }
      console.log(result.message.replace(/\*\*/g, ""));
      return;
    }

    const args: string[] = [];
    if (opts.list) args.push("list");
    else if (opts.provider) args.push("provider", opts.provider);
    else if (spec) args.push(spec);

    const { handleModelCommand } = await import("@git-mentor/llm");
    const result = await handleModelCommand(config, args);
    if (result.changed) {
      saveConfig(config);
      const status = await new LLMRouter(config).healthCheck();
      console.log(theme.success("Model updated"));
      console.log(result.message.replace(/\*\*/g, ""));
      console.log(theme.muted(status.ok ? status.message : status.message));
    } else {
      console.log(result.message.replace(/\*\*/g, ""));
    }
  });

program.command("mcp").description("Start MCP server (stdio)").action(async () => {
  await import("./mcp.js");
});

program
  .command("chat [username]")
  .description("Interactive career coach chat (alias for gitmentor)")
  .option("--role, -r <role>", "Target role id")
  .option("--deterministic", "Run without LLM")
  .action(async (username = "me", opts: { role?: string; deterministic?: boolean }) => {
    await launchChat(username, opts);
  });

program
  .command("app")
  .description("Launch local chat app in the browser")
  .option("--port <port>", "HTTP port", "3847")
  .action(async (opts: { port: string }) => {
    const { createChatServer } = await import("./app-server.js");
    const { port, start } = createChatServer(Number(opts.port));
    start();
    console.log(chalk.green(`git-mentor app running at http://localhost:${port}`));
    console.log(chalk.dim("Press Ctrl+C to stop."));
  });

program
  .command("eval")
  .option("--json", "Print JSON summary")
  .action(async (opts: { json?: boolean }) => {
    const { runBenchmark, formatReport } = await import("./eval.js");
    const report = runBenchmark();
    console.log(opts.json ? JSON.stringify(report, null, 2) : formatReport(report));
    if (report.passRate < 0.8) process.exit(1);
  });

program.parseAsync(process.argv).catch((error: Error) => {
  console.error(chalk.red(error.message));
  process.exit(1);
});
