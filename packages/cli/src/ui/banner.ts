import type { GitMentorConfig } from "@git-mentor/core";
import { GITHUB_MCP_SERVER_NAME, GITHUB_MCP_SHIPPED_TOOLS, isGitHubMcpEnabled } from "@git-mentor/github";
import { LOGO, LOGO_TAGLINE } from "./logo.js";
import { theme } from "./theme.js";

export const GITMENTOR_VERSION = "0.1.0";

export const SLASH_COMMAND_GROUPS: Array<{ label: string; commands: string[] }> = [
  { label: "Profile", commands: ["/analyze profile", "/gaps", "/improve", "/apply"] },
  { label: "GitHub", commands: ["/followers", "/following", "/discussions", "/fork"] },
  { label: "Session", commands: ["/model", "/role", "/login", "/export", "/help"] },
];

export const GETTING_STARTED_COMMANDS = [
  "gitmentor init",
  "gitmentor login",
  "gitmentor",
  "gitmentor doctor",
  "gitmentor model",
  "gitmentor mcp",
] as const;

export interface TerminalBannerOptions {
  subtitle?: string;
  config?: GitMentorConfig;
  username?: string;
  roleId?: string;
  provider?: string;
  model?: string;
  profileLoaded?: boolean;
  activeSkills?: number;
  totalSkills?: number;
}

export function printTerminalBanner(options: TerminalBannerOptions = {}): void {
  console.log();
  for (const line of LOGO) console.log(theme.brand(line));
  console.log(theme.muted(LOGO_TAGLINE));
  console.log();

  const title = theme.brandBold(`v${GITMENTOR_VERSION}`);
  const border = theme.border("─".repeat(Math.min(process.stdout.columns ?? 72, 72)));
  console.log(border);
  console.log(title);
  if (options.subtitle) console.log(theme.muted(options.subtitle));

  if (options.username) {
    const profile = options.profileLoaded ? theme.success("profile loaded") : theme.muted("profile pending");
    const llm =
      options.provider && options.model
        ? `${options.provider}/${options.model}`
        : theme.muted("model not set");
    console.log(
      theme.muted(
        `@${options.username} · ${options.roleId ?? "role?"} · ${llm} · ${profile}`,
      ),
    );
  }

  if (options.config) {
    const gh = isGitHubMcpEnabled(options.config)
      ? theme.success(`MCP ${GITHUB_MCP_SERVER_NAME} (${GITHUB_MCP_SHIPPED_TOOLS.length} tools)`)
      : theme.muted(`MCP ${GITHUB_MCP_SERVER_NAME} off — run gitmentor login`);
    const skills =
      options.activeSkills !== undefined && options.totalSkills !== undefined
        ? `${options.activeSkills}/${options.totalSkills} skills active`
        : null;
    console.log(theme.muted([gh, skills].filter(Boolean).join(" · ")));
  }

  console.log(border);
  console.log(theme.brandBold("Slash commands"));
  for (const group of SLASH_COMMAND_GROUPS) {
    console.log(
      `  ${theme.muted(`${group.label}:`)} ${group.commands.map((c) => theme.brand(c)).join(theme.muted(" · "))}`,
    );
  }
  console.log();
  console.log(theme.muted("Type /help in chat · Esc empty prompt to quit"));
  console.log();
}
