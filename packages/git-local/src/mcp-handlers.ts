import { z } from "zod";
import {
  gitBranchList,
  gitClone,
  gitDiffStat,
  gitListWorkspaces,
  gitLog,
  gitPull,
  gitStatus,
} from "./operations.js";

export const GIT_LOCAL_MCP_SHIPPED_TOOLS = [
  "git_clone",
  "git_pull",
  "git_status",
  "git_log",
  "git_branch_list",
  "git_diff_stat",
  "list_workspaces",
] as const;

export const GIT_LOCAL_MCP_TOOL_DEFINITIONS = [
  {
    name: "git_clone",
    description:
      "Clone a GitHub repository into ~/.local/share/git-mentor/workspaces/{owner}/{repo}. Default shallow depth 1.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        remote_url: { type: "string", description: "HTTPS git URL (default github.com)" },
        branch: { type: "string", description: "Branch to clone" },
        depth: { type: "number", description: "Shallow depth (default 1; use 0 for full clone)" },
        force: { type: "boolean", description: "Remove existing workspace and re-clone" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "git_pull",
    description: "Fast-forward pull in an existing workspace",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "git_status",
    description: "Porcelain git status for a workspace",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "git_log",
    description: "Recent commits (oneline) in a workspace",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        max_count: { type: "number", description: "Max commits (default 20, cap 100)" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "git_branch_list",
    description: "List local and remote branches in a workspace",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "git_diff_stat",
    description: "Diff stat in workspace (unstaged, or base..head)",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        base: { type: "string" },
        head: { type: "string" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "list_workspaces",
    description: "List all cloned git-mentor workspaces under the data directory",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

const CloneSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  remote_url: z.string().optional(),
  branch: z.string().optional(),
  depth: z.number().optional(),
  force: z.boolean().optional(),
});

const OwnerRepoSchema = z.object({
  owner: z.string(),
  repo: z.string(),
});

const LogSchema = OwnerRepoSchema.extend({
  max_count: z.number().optional(),
});

const DiffSchema = OwnerRepoSchema.extend({
  base: z.string().optional(),
  head: z.string().optional(),
});

export async function callGitLocalMcpTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "git_clone":
      return gitClone(CloneSchema.parse(args));
    case "git_pull":
      return gitPull(...parseOwnerRepo(args));
    case "git_status":
      return gitStatus(...parseOwnerRepo(args));
    case "git_log": {
      const parsed = LogSchema.parse(args);
      return gitLog(parsed.owner, parsed.repo, parsed.max_count);
    }
    case "git_branch_list":
      return gitBranchList(...parseOwnerRepo(args));
    case "git_diff_stat": {
      const parsed = DiffSchema.parse(args);
      return gitDiffStat(parsed.owner, parsed.repo, parsed.base, parsed.head);
    }
    case "list_workspaces":
      return gitListWorkspaces();
    default:
      throw new Error(`Unknown git-local tool: ${name}`);
  }
}

function parseOwnerRepo(args: Record<string, unknown>): [string, string] {
  const parsed = OwnerRepoSchema.parse(args);
  return [parsed.owner, parsed.repo];
}
