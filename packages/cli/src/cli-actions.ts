import chalk from "chalk";
import { loadConfig, saveConfig, type LoginTarget, parseLoginTargetArg } from "@git-mentor/core";
import { printTerminalBanner } from "./ui/banner.js";
import { theme } from "./ui/theme.js";

/** First positional arg that is a subcommand name, not a GitHub username. */
export const GITMENTOR_SUBCOMMANDS = new Set([
  "init",
  "auth",
  "login",
  "signin",
  "roles",
  "analyze",
  "coach",
  "growth",
  "export",
  "doctor",
  "model",
  "mcp",
  "chat",
  "eval",
  "help",
]);

export function isGitMentorSubcommand(arg: string): boolean {
  return GITMENTOR_SUBCOMMANDS.has(arg.replace(/^@/, "").toLowerCase());
}

export async function runOllamaSignInCli(): Promise<boolean> {
  const config = loadConfig();
  const { runOllamaSignIn } = await import("./model-picker.js");
  const result = await runOllamaSignIn(config);
  console.log(result.message.replace(/\*\*/g, ""));
  return true;
}

export async function runGitHubLoginCli(): Promise<boolean> {
  const {
    formatPostAuthMessage,
    isGhCliInstalled,
    runGhAuthInteractive,
    syncGitHubMcpInConfig,
  } = await import("@git-mentor/github");

  if (!isGhCliInstalled()) {
    console.log(chalk.red("GitHub CLI (gh) is not installed. https://cli.github.com/"));
    process.exitCode = 1;
    return false;
  }

  const config = loadConfig();
  console.log(chalk.cyan("Complete GitHub sign-in in your browser (device code)…"));
  try {
    await runGhAuthInteractive("login", {
      onStatus: (line) => console.log(chalk.dim(line)),
    });
    if (syncGitHubMcpInConfig(config)) saveConfig(config);
    console.log(chalk.green((await formatPostAuthMessage(config)).replace(/\*\*/g, "")));
    return true;
  } catch (error) {
    console.log(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
    return false;
  }
}

export async function runLoginCli(targetArg?: string): Promise<void> {
  const target = parseLoginTargetArg(targetArg);
  if (!target) {
    console.log(chalk.yellow("Usage: gitmentor login [gh|ollama]"));
    console.log(chalk.dim("  gitmentor login         — GitHub, then Ollama (sequential)"));
    console.log(chalk.dim("  gitmentor login gh      — GitHub only"));
    console.log(chalk.dim("  gitmentor login ollama  — Ollama cloud only"));
    process.exitCode = 1;
    return;
  }

  printTerminalBanner({
    subtitle: `Sign in: ${target === "both" ? "GitHub + Ollama" : target}`,
    config: loadConfig(),
  });

  const total = target === "both" ? 2 : 1;
  let index = 0;
  const messages: string[] = [];

  if (target === "gh" || target === "both") {
    index += 1;
    console.log(chalk.bold.cyan(`\n[${index}/${total}] GitHub\n`));
    const ghOk = await runGitHubLoginCli();
    if (!ghOk) {
      if (target === "both") {
        console.log(chalk.yellow("\nSkipping Ollama until GitHub sign-in succeeds."));
      }
      return;
    }
    messages.push("GitHub: OK");
  }

  if (target === "ollama" || target === "both") {
    index += 1;
    console.log(chalk.bold.cyan(`\n[${index}/${total}] Ollama cloud\n`));
    if (process.stdout.isTTY) {
      const { runOllamaSignInInk } = await import("./ink/ModelSelectView.js");
      const result = await runOllamaSignInInk();
      const line = result.message.replace(/\*\*/g, "");
      console.log(line);
      if (line.toLowerCase().includes("failed") || line.toLowerCase().includes("timed out")) {
        process.exitCode = 1;
      }
    } else {
      await runOllamaSignInCli();
    }
  }
}

export function printSubcommandHint(name: string): void {
  const hints: Record<string, string> = {
    signin: "gitmentor login ollama",
    login: "gitmentor login [gh|ollama]",
    auth: "gitmentor auth [status|login|refresh]",
    model: "gitmentor model",
    init: "gitmentor init",
    help: "gitmentor --help",
  };
  const cmd = hints[name] ?? `gitmentor ${name}`;
  console.log(theme.muted(`"${name}" is a gitmentor command, not a GitHub username.`));
  console.log(theme.muted(`Run: ${cmd}`));
}

export type { LoginTarget };
