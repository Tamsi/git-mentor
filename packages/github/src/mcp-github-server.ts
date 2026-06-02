#!/usr/bin/env node
/**
 * Git-mentor GitHub MCP server — fork + follow_user (extends deprecated server-github surface).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { parseOAuthScopesHeader } from "./scopes.js";

const GITHUB_API = "https://api.github.com";
const API_VERSION = "2022-11-28";

const ForkRepositorySchema = z.object({
  owner: z.string(),
  repo: z.string(),
  organization: z.string().optional(),
});

const FollowUserSchema = z.object({
  username: z.string(),
});

function token(): string {
  const value =
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN ??
    process.env.GITHUB_TOKEN ??
    process.env.GIT_MENTOR_GITHUB_TOKEN;
  if (!value?.trim()) {
    throw new Error("GITHUB_PERSONAL_ACCESS_TOKEN is required for the GitHub MCP server.");
  }
  return value.trim();
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${token()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    ...extra,
  };
}

async function githubFetch(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { message?: string; documentation_url?: string };
      detail = body.message ?? detail;
      if (body.documentation_url) detail += ` — ${body.documentation_url}`;
    } catch {
      // ignore parse errors
    }
    if (response.status === 404 && detail.toLowerCase().includes("not found")) {
      const tokenScopes = parseOAuthScopesHeader(response.headers.get("x-oauth-scopes"));
      const accepted = parseOAuthScopesHeader(response.headers.get("x-accepted-oauth-scopes"));
      const scopeList =
        tokenScopes.length > 0 ? `Current token scopes: ${tokenScopes.join(", ")}.` : "";
      const need =
        accepted.length > 0 ? `Required: ${accepted.join(" or ")}.` : "Required: user (includes user:follow).";
      throw new Error(
        `${detail}\n${scopeList} ${need}\nRun: gh auth refresh -h github.com -s user — then restart gitmentor.`,
      );
    }
    throw new Error(detail);
  }
  return response;
}

async function forkRepository(owner: string, repo: string, organization?: string) {
  const url = organization
    ? `${GITHUB_API}/repos/${owner}/${repo}/forks?organization=${encodeURIComponent(organization)}`
    : `${GITHUB_API}/repos/${owner}/${repo}/forks`;
  const response = await githubFetch(url, {
    method: "POST",
    headers: authHeaders({ "Content-Length": "0" }),
  });
  return response.json();
}

async function isFollowing(username: string): Promise<boolean> {
  const response = await fetch(`${GITHUB_API}/user/following/${encodeURIComponent(username)}`, {
    headers: authHeaders(),
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return true;
}

async function followUser(username: string) {
  const clean = username.replace(/^@/, "");
  if (await isFollowing(clean)) {
    return { username: clean, status: "already_following" as const };
  }
  await githubFetch(`${GITHUB_API}/user/following/${encodeURIComponent(clean)}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Length": "0" }),
  });
  return { username: clean, status: "followed" as const };
}

const server = new Server(
  { name: "git-mentor-github-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "fork_repository",
      description: "Fork a GitHub repository to your account",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          organization: { type: "string", description: "Organization to fork into (optional)" },
        },
        required: ["owner", "repo"],
      },
    },
    {
      name: "follow_user",
      description: "Follow a GitHub user (requires user:follow / gh auth refresh -s user)",
      inputSchema: {
        type: "object",
        properties: {
          username: { type: "string", description: "GitHub username to follow" },
        },
        required: ["username"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "fork_repository": {
        const args = ForkRepositorySchema.parse(request.params.arguments ?? {});
        const fork = await forkRepository(args.owner, args.repo, args.organization);
        return {
          content: [{ type: "text", text: JSON.stringify(fork, null, 2) }],
        };
      }
      case "follow_user": {
        const args = FollowUserSchema.parse(request.params.arguments ?? {});
        const result = await followUser(args.username);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }
      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: message }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
