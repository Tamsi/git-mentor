import { saveConfig } from "@git-mentor/core";
import {
  formatGitHubAuthStatusMarkdown,
  getGitHubAuthReport,
  resolveAuthenticatedUsername,
  runGhAuthInteractive,
  syncGitHubMcpInConfig,
} from "@git-mentor/github";
import { formatCommandError } from "./command-utils.js";
import { formatToolResult } from "./prompts.js";
import type { CommandContext } from "./commands.js";
import type { ChatReply } from "./types.js";

export function isGitHubAuthInteractiveSubcommand(args: string[]): boolean {
  const sub = args[0]?.toLowerCase();
  return sub === "login" || sub === "refresh";
}

export async function handleGitHubAuthCommand(ctx: CommandContext, args: string[]): Promise<ChatReply> {
  const sub = args[0]?.toLowerCase();

  if (!sub || sub === "status") {
    const report = await getGitHubAuthReport(ctx.config);
    return {
      content: formatToolResult("GitHub authentication", formatGitHubAuthStatusMarkdown(report)),
      toolUsed: "auth",
    };
  }

  if (sub === "help") {
    return {
      content: [
        "**GitHub auth (`gh` CLI)**",
        "- `/auth` or `/auth status` — token scopes and follow readiness",
        "- `/auth login` — sign in via browser (interactive)",
        "- `/auth refresh` — add missing scopes (`user`, `repo`, …) via browser",
        "",
        "CLI: `gitmentor auth` · `gitmentor auth login` · `gitmentor auth refresh`",
      ].join("\n"),
      toolUsed: "auth",
    };
  }

  if (isGitHubAuthInteractiveSubcommand(args)) {
    const action = sub as "login" | "refresh";
    if (!process.stdin.isTTY) {
      return {
        content: formatToolResult(
          "GitHub auth",
          `Interactive sign-in needs a terminal. Run \`gitmentor auth ${action}\` or use the gitmentor chat UI.`,
        ),
        toolUsed: "auth",
      };
    }
    try {
      await runGhAuthInteractive(action);
      return completeGitHubAuthFlow(ctx, action);
    } catch (error) {
      return {
        content: formatCommandError(error),
        toolUsed: "auth",
      };
    }
  }

  return {
    content: `Unknown /auth subcommand \`${sub}\`. Try \`/auth help\`.`,
    toolUsed: "auth",
  };
}

export async function completeGitHubAuthFlow(
  ctx: CommandContext,
  action: "login" | "refresh",
): Promise<ChatReply> {
  const changed = syncGitHubMcpInConfig(ctx.config);
  if (changed) saveConfig(ctx.config);

  const login = await resolveAuthenticatedUsername(ctx.config);
  if (login) ctx.setUsername(login);

  const body = await formatPostAuthMessage(ctx.config);
  const title = action === "login" ? "GitHub sign-in complete" : "GitHub token refreshed";

  return {
    content: formatToolResult(title, body),
    toolUsed: "auth",
  };
}
