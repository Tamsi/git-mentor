import type { GitMentorConfig } from "@git-mentor/core";
import {
  GITHUB_MCP_TOOL_DEFINITIONS,
  isGitHubMcpEnabled,
  resolveAuthenticatedUsername,
} from "@git-mentor/github";
import type { OllamaToolDefinition } from "@git-mentor/llm";
import { runOllamaToolChat } from "@git-mentor/llm";
import type { CommandContext } from "./commands.js";
import { stripAtUsername } from "./command-utils.js";
import {
  COACHING_TOOL_DEFINITIONS,
  executeCoachingTool,
  isCoachingTool,
} from "./coaching-tools.js";
import { formatGithubToolResult, invokeGithubTool } from "./github-tool-bridge.js";
import { formatToolResult } from "./prompts.js";
import type { ProgressCallback } from "./types.js";

const GITHUB_TOOL_NAMES = new Set(GITHUB_MCP_TOOL_DEFINITIONS.map((t) => t.name));

function toOllamaTools(
  defs: ReadonlyArray<{ name: string; description: string; inputSchema: unknown }>,
): OllamaToolDefinition[] {
  return defs.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema as Record<string, unknown>,
    },
  }));
}

export async function canUseGithubToolCalling(
  config: GitMentorConfig,
  sessionUsername: string,
): Promise<boolean> {
  if (config.llm.provider !== "ollama") return false;
  if (!isGitHubMcpEnabled(config)) return false;
  const authLogin = await resolveAuthenticatedUsername(config);
  if (!authLogin) return false;
  return authLogin.toLowerCase() === stripAtUsername(sessionUsername).toLowerCase();
}

export function canUseCoachingToolCalling(config: GitMentorConfig): boolean {
  return config.llm.provider === "ollama";
}

export function githubToolsForLlm(): OllamaToolDefinition[] {
  return toOllamaTools(GITHUB_MCP_TOOL_DEFINITIONS);
}

export function coachingToolsForLlm(): OllamaToolDefinition[] {
  return toOllamaTools(COACHING_TOOL_DEFINITIONS);
}

export async function canUseAnyMcpToolCalling(
  config: GitMentorConfig,
  sessionUsername: string,
): Promise<boolean> {
  if (config.llm.provider !== "ollama") return false;
  if (canUseCoachingToolCalling(config)) return true;
  return canUseGithubToolCalling(config, sessionUsername);
}

export async function chatWithMcpTools(options: {
  config: GitMentorConfig;
  sessionUsername: string;
  messages: Array<{ role: string; content: string }>;
  commandContext?: CommandContext;
  onProgress?: ProgressCallback;
  onToolStart?: (name: string) => void;
}): Promise<string> {
  const githubAllowed = await canUseGithubToolCalling(options.config, options.sessionUsername);
  const coachingAllowed = canUseCoachingToolCalling(options.config) && Boolean(options.commandContext);

  if (!githubAllowed && !coachingAllowed) {
    throw new Error(
      "Tool calling requires Ollama. Coaching tools need an active session; GitHub tools need MCP + auth on your profile.",
    );
  }

  const tools: OllamaToolDefinition[] = [];
  if (coachingAllowed) tools.push(...coachingToolsForLlm());
  if (githubAllowed) tools.push(...githubToolsForLlm());

  const result = await runOllamaToolChat({
    baseUrl: options.config.llm.baseUrl,
    model: options.config.llm.model,
    temperature: options.config.llm.temperature,
    messages: options.messages,
    tools,
    onToolStart: options.onToolStart,
    executeTool: async (name, args) => {
      if (isCoachingTool(name)) {
        if (!options.commandContext) throw new Error("Coaching tools unavailable in this context.");
        return executeCoachingTool(name, args, options.commandContext, options.onProgress);
      }
      if (!GITHUB_TOOL_NAMES.has(name)) {
        throw new Error(`Unknown tool: ${name}`);
      }
      if (!githubAllowed) {
        throw new Error("GitHub tool calling is not available for this session.");
      }
      const payload = await invokeGithubTool(options.config, name, args);
      return formatGithubToolResult(payload);
    },
  });

  if (result.toolCallsExecuted.length === 0) {
    return result.content;
  }

  const toolList = result.toolCallsExecuted.map((t) => `\`${t}\``).join(", ");
  const writeTools = new Set([
    "update_user_profile",
    "upsert_repository_file",
    "pin_repositories",
    "follow_user",
    "fork_repository",
    "create_repository",
    "create_discussion",
    "create_discussion_comment",
  ]);
  const hint = result.toolCallsExecuted.some((t) => writeTools.has(t))
    ? "Run **`/analyze profile`** or ask me to refresh your profile to update the coaching dossier."
    : "";

  return formatToolResult(
    "Actions completed",
    [
      `Tools used: ${toolList}`,
      "",
      result.content || "_Tools ran successfully._",
      hint ? `\n${hint}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}
