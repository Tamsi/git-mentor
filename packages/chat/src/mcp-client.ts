import type { GitMentorConfig } from "@git-mentor/core";
import { resolveGitHubTokenForMcp } from "@git-mentor/github";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export const GITMENTOR_BUILTIN_MCP_TOOLS = [
  "analyze_profile",
  "compare_role",
  "get_recommendations",
  "discover_trending_repos",
  "improve_profile",
  "analyze_repository",
  "analyze_repository_for_user",
  "list_target_roles",
  "list_rules",
  "list_skills",
  "get_agent_context",
] as const;

function resolveEnvValue(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, key: string) => process.env[key] ?? "");
}

function findServer(config: GitMentorConfig, name: string) {
  return config.mcp.servers.find((server) => server.name === name && server.enabled);
}

function buildServerEnv(config: GitMentorConfig, server: GitMentorConfig["mcp"]["servers"][number]) {
  const env = { ...process.env } as Record<string, string | undefined>;
  if (server.env) {
    for (const [key, value] of Object.entries(server.env)) {
      env[key] = resolveEnvValue(value);
    }
  }
  if (server.name === "github") {
    const token = resolveGitHubTokenForMcp(config);
    if (token) env.GITHUB_PERSONAL_ACCESS_TOKEN = token;
  }
  return env as NodeJS.ProcessEnv;
}

async function withMcpClient<T>(
  config: GitMentorConfig,
  serverName: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const server = findServer(config, serverName);
  if (!server) {
    throw new Error(`MCP server "${serverName}" is not configured or disabled.`);
  }

  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args,
    env: buildServerEnv(config, server),
  });

  const client = new Client({ name: "git-mentor-chat", version: "0.1.0" });
  await client.connect(transport);

  try {
    return await fn(client);
  } finally {
    await transport.close();
  }
}

export async function listExternalMcpTools(
  config: GitMentorConfig,
  serverName: string,
): Promise<Array<{ name: string; description?: string }>> {
  return withMcpClient(config, serverName, async (client) => {
    const result = await client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
  });
}

export async function callExternalMcpTool(
  config: GitMentorConfig,
  serverName: string,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  return withMcpClient(config, serverName, async (client) => {
    const result = await client.callTool({ name: toolName, arguments: args });
    const textParts = (result.content ?? [])
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text);
    return textParts.join("\n") || JSON.stringify(result, null, 2);
  });
}

export function formatMcpServersList(config: GitMentorConfig): string {
  const enabled = config.mcp.servers.filter((server) => server.enabled);
  const lines = [
    "**Built-in MCP server** (`gitmentor mcp`):",
    GITMENTOR_BUILTIN_MCP_TOOLS.map((tool) => `- \`${tool}\``).join("\n"),
  ];

  if (enabled.length === 0) {
    lines.push(
      "",
      "No external MCP servers enabled. With `gh auth login`, gitmentor auto-enables the GitHub MCP server.",
    );
    return lines.join("\n");
  }

  lines.push("", "**Configured external servers:**");
  for (const server of enabled) {
    lines.push(`- **${server.name}** — \`${server.command} ${server.args.join(" ")}\``);
    if (server.name === "github") {
      lines.push("  GitHub actions: `fork_repository`, `create_issue`, `create_pull_request`, `search_repositories`, …");
      lines.push("  Chat shortcut: `/fork owner/repo`");
    }
  }
  lines.push("", "Use `/mcp tools <server>` or `/mcp call <server> <tool> [json]`.");
  return lines.join("\n");
}
