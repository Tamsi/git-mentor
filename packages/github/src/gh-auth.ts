import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import type { GitMentorConfig } from "@git-mentor/core";
import { ensureGitHubMcpServer } from "./mcp-setup.js";
import {
  formatMissingFollowScopeMessage,
  resolveGitHubOAuthScopes,
  tokenCanFollowUsers,
} from "./scopes.js";

/** Scopes git-mentor needs for profile ingest, MCP fork/follow, and org reads. */
export const GITMENTOR_GH_SCOPES = ["user", "repo", "read:org", "gist", "workflow"] as const;

export function ghScopesFlag(scopes: readonly string[] = GITMENTOR_GH_SCOPES): string {
  return scopes.join(",");
}

export function isGhCliInstalled(): boolean {
  try {
    execSync("gh --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export interface GhAuthStatusReport {
  ghInstalled: boolean;
  loggedIn: boolean;
  account?: string;
  host?: string;
  scopes: string[];
  canFollow: boolean;
  rawStatus?: string;
}

export function parseGhAuthStatusOutput(output: string): Pick<GhAuthStatusReport, "loggedIn" | "account" | "host" | "scopes"> {
  const loggedIn = /Logged in to/i.test(output);
  const accountMatch = output.match(/Logged in to \S+ account (\S+)/i);
  const hostMatch = output.match(/^(\S+)\s*$/m);
  const scopesLine = output.match(/Token scopes:\s*(.+)/)?.[1] ?? "";
  const scopes = [...scopesLine.matchAll(/'([^']+)'/g)].map((m) => m[1]!.trim()).filter(Boolean);

  return {
    loggedIn,
    account: accountMatch?.[1],
    host: hostMatch?.[1],
    scopes,
  };
}

export function readGhAuthStatus(): GhAuthStatusReport {
  if (!isGhCliInstalled()) {
    return { ghInstalled: false, loggedIn: false, scopes: [], canFollow: false };
  }

  try {
    const rawStatus = execSync("gh auth status", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = parseGhAuthStatusOutput(rawStatus);
    return {
      ghInstalled: true,
      ...parsed,
      scopes: parsed.scopes,
      canFollow: tokenCanFollowUsers(parsed.scopes),
      rawStatus: rawStatus.trim(),
    };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string };
    const combined = `${execError.stdout ?? ""}\n${execError.stderr ?? ""}`.trim();
    if (combined) {
      const parsed = parseGhAuthStatusOutput(combined);
      return {
        ghInstalled: true,
        ...parsed,
        scopes: parsed.scopes,
        canFollow: tokenCanFollowUsers(parsed.scopes),
        rawStatus: combined,
      };
    }
    return { ghInstalled: true, loggedIn: false, scopes: [], canFollow: false };
  }
}

export async function getGitHubAuthReport(config: GitMentorConfig): Promise<GhAuthStatusReport> {
  const gh = readGhAuthStatus();
  const apiScopes = await resolveGitHubOAuthScopes(config);
  const scopes = apiScopes.length > 0 ? apiScopes : gh.scopes;
  return {
    ...gh,
    scopes,
    canFollow: tokenCanFollowUsers(scopes),
  };
}

export function formatGitHubAuthStatusMarkdown(report: GhAuthStatusReport): string {
  if (!report.ghInstalled) {
    return [
      "**GitHub CLI (`gh`)** is not installed.",
      "",
      "Install from https://cli.github.com/ then run **`/auth login`** or:",
      "```bash",
      "gitmentor auth login",
      "```",
    ].join("\n");
  }

  if (!report.loggedIn) {
    return [
      "**GitHub:** not logged in.",
      "",
      "Run **`/auth login`** (opens browser) or:",
      "```bash",
      "gitmentor auth login",
      "```",
    ].join("\n");
  }

  const scopeList = report.scopes.length > 0 ? report.scopes.map((s) => `\`${s}\``).join(", ") : "_unknown_";
  const lines = [
    `**GitHub:** logged in as **@${report.account ?? "?"}** (${report.host ?? "github.com"})`,
    `**Token scopes:** ${scopeList}`,
    report.canFollow
      ? "**Follow via MCP:** ready (`user` / `user:follow` present)."
      : "**Follow via MCP:** blocked — missing **`user`** scope.",
  ];

  if (!report.canFollow) {
    lines.push("", "Run **`/auth refresh`** to add scopes (browser), then retry **`/follow apply`**.");
  } else {
    lines.push("", "Reconnect anytime: **`/auth refresh`** · sign in again: **`/auth login`**");
  }

  return lines.join("\n");
}

export function syncGitHubMcpInConfig(config: GitMentorConfig): boolean {
  return ensureGitHubMcpServer(config);
}

function pushGhOutput(
  chunk: string,
  buffer: { stdout: string; stderr: string },
  onStatus?: (message: string) => void,
): void {
  buffer.stdout += chunk;
  const lines = chunk.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const hint = lines.at(-1);
  if (hint) onStatus?.(hint);
}

export async function runGhAuthInteractive(
  action: "login" | "refresh",
  options?: { onStatus?: (message: string) => void; /** Avoid fighting Ink UI — capture gh output instead. */ piped?: boolean },
): Promise<void> {
  if (!isGhCliInstalled()) {
    throw new Error("GitHub CLI (`gh`) is not installed. Install from https://cli.github.com/");
  }

  const scopes = ghScopesFlag();
  const args =
    action === "login"
      ? ["auth", "login", "-h", "github.com", "-p", "https", "-w", "-s", scopes]
      : ["auth", "refresh", "-h", "github.com", "-s", scopes];

  options?.onStatus?.(
    action === "login"
      ? "Complete GitHub sign-in in your browser…"
      : "Approve updated GitHub permissions in your browser…",
  );

  const inherit = !options?.piped && Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const buffer = { stdout: "", stderr: "" };

  await new Promise<void>((resolve, reject) => {
    const child = spawn("gh", args, {
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    if (!inherit) {
      child.stdout?.on("data", (chunk) => {
        pushGhOutput(String(chunk), buffer, options?.onStatus);
      });
      child.stderr?.on("data", (chunk) => {
        pushGhOutput(String(chunk), buffer, options?.onStatus);
      });
    }
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = (buffer.stderr || buffer.stdout).trim();
      reject(
        new Error(
          detail
            ? `gh ${args.join(" ")} failed: ${detail}`
            : `gh auth ${action} failed (exit ${code ?? "unknown"}). Try in a terminal: gitmentor auth ${action}`,
        ),
      );
    });
  });
}

export async function formatPostAuthMessage(config: GitMentorConfig): Promise<string> {
  const report = await getGitHubAuthReport(config);
  const parts = [formatGitHubAuthStatusMarkdown(report)];
  if (!report.canFollow) {
    parts.push("", formatMissingFollowScopeMessage(report.scopes));
  }
  return parts.join("\n");
}
