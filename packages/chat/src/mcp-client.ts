import type { GitMentorConfig } from "@git-mentor/core";
import { GITMENTOR_BUILTIN_MCP_TOOLS } from "@git-mentor/core";
import { GITHUB_MCP_SHIPPED_TOOLS, resolveGitHubTokenForMcp } from "@git-mentor/github";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export { GITMENTOR_BUILTIN_MCP_TOOLS } from "@git-mentor/core";

function resolveEnvValue(value: string): string {
  let out = value;
  let start = out.indexOf("${");
  while (start !== -1) {
    const end = out.indexOf("}", start);
    if (end === -1) break;
    const key = out.slice(start + 2, end);
    out = out.slice(0, start) + (process.env[key] ?? "") + out.slice(end + 1);
    start = out.indexOf("${", start);
  }
  return out;
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
      lines.push(
        `  Shipped tools: ${GITHUB_MCP_SHIPPED_TOOLS.map((t) => `\`${t}\``).join(", ")} — see \`~/.config/git-mentor/mcp/tools.md\``,
      );
      lines.push("  Chat: `/fork owner/repo` · `/follow apply` · GitHub tools in free-form chat");
    }
  }
  lines.push("", "Use `/mcp tools <server>` or `/mcp call <server> <tool> [json]`.");
  return lines.join("\n");
}
