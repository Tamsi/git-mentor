import type { GitMentorConfig } from "@git-mentor/core";
import {
  GITHUB_MCP_TOOL_DEFINITIONS,
  isGitHubMcpEnabled,
  resolveAuthenticatedUsername,
} from "@git-mentor/github";
import type { OllamaToolDefinition } from "@git-mentor/llm";
import { runOllamaToolChat } from "@git-mentor/llm";
import { stripAtUsername } from "./command-utils.js";
import { formatGithubToolResult, invokeGithubTool } from "./github-tool-bridge.js";
import { formatToolResult } from "./prompts.js";

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

export function githubToolsForLlm(): OllamaToolDefinition[] {
  return toOllamaTools(GITHUB_MCP_TOOL_DEFINITIONS);
}

/** @deprecated Use {@link canUseGithubToolCalling} */
export const canUseAnyMcpToolCalling = canUseGithubToolCalling;

export async function chatWithMcpTools(options: {
  config: GitMentorConfig;
  sessionUsername: string;
  messages: Array<{ role: string; content: string }>;
  onToolStart?: (name: string) => void;
}): Promise<string> {
  const allowed = await canUseGithubToolCalling(options.config, options.sessionUsername);
  if (!allowed) {
    throw new Error("GitHub tool calling requires Ollama, GitHub MCP, and auth on your own profile.");
  }

  const result = await runOllamaToolChat({
    baseUrl: options.config.llm.baseUrl,
    model: options.config.llm.model,
    temperature: options.config.llm.temperature,
    messages: options.messages,
    tools: githubToolsForLlm(),
    onToolStart: options.onToolStart,
    executeTool: async (name, args) => {
      if (!GITHUB_TOOL_NAMES.has(name)) {
        throw new Error(`Unknown tool: ${name}`);
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
    ? "Run **`/analyze profile`** to refresh your coaching dossier."
    : "";

  return formatToolResult(
    "GitHub actions completed",
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
