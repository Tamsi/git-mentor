import type { CommandContext } from "./commands.js";
import { dispatchCommand } from "./commands.js";
import type { ProgressCallback } from "./types.js";

export interface CoachingToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Same capabilities as slash commands — exposed to the chat LLM as tools. */
export const COACHING_TOOL_DEFINITIONS: CoachingToolDefinition[] = [
  {
    name: "analyze_profile",
    description:
      "Refresh GitHub profile attractiveness audit and career dossier (bio, README, pins, gaps). Same as /analyze profile.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "analyze_repository",
    description:
      "Deep-scan a repository with LLM coaching summary (manifests, stack). Same as /analyze owner/repo.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (optional — defaults to session user)" },
        repo: { type: "string", description: "Repository name, e.g. git-mentor" },
      },
      required: ["repo"],
    },
  },
  {
    name: "get_career_gaps",
    description: "Career gap analysis vs target role. Same as /gaps.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_growth_plan",
    description: "Growth recommendations and technologies to learn. Same as /growth.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_profile_improvements",
    description: "Actionable GitHub profile improvement plan. Same as /improve.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "discover_trending_repos",
    description: "Find trending repositories aligned with the user's stack and role. Same as /trending.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "discover_profiles_to_follow",
    description: "Role models and maintainers to follow on GitHub. Same as /follow.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

const COACHING_TOOL_NAMES = new Set(COACHING_TOOL_DEFINITIONS.map((t) => t.name));

export function isCoachingTool(name: string): boolean {
  return COACHING_TOOL_NAMES.has(name);
}

function repoArg(args: Record<string, unknown>, sessionUser: string): string {
  const repo = String(args.repo ?? "").trim();
  const owner = String(args.owner ?? "").trim();
  if (!repo) throw new Error("analyze_repository requires repo");
  if (owner) return `${owner}/${repo}`;
  if (repo.includes("/")) return repo;
  return `${sessionUser}/${repo}`;
}

export async function executeCoachingTool(
  name: string,
  args: Record<string, unknown>,
  ctx: CommandContext,
  onProgress?: ProgressCallback,
): Promise<string> {
  switch (name) {
    case "analyze_profile": {
      const opening = await ctx.runProfileAnalysis(onProgress);
      ctx.pushHistory("assistant", opening);
      return opening;
    }
    case "analyze_repository": {
      const reply = await ctx.runRepoAnalysis(repoArg(args, ctx.getUsername()), onProgress);
      return reply.content;
    }
    case "get_career_gaps": {
      const reply = await dispatchCommand(ctx, "/gaps");
      return reply.content;
    }
    case "get_growth_plan": {
      const reply = await dispatchCommand(ctx, "/growth");
      return reply.content;
    }
    case "get_profile_improvements": {
      const reply = await dispatchCommand(ctx, "/improve");
      return reply.content;
    }
    case "discover_trending_repos": {
      const reply = await dispatchCommand(ctx, "/trending", onProgress);
      return reply.content;
    }
    case "discover_profiles_to_follow": {
      const reply = await dispatchCommand(ctx, "/follow", onProgress);
      return reply.content;
    }
    default:
      throw new Error(`Unknown coaching tool: ${name}`);
  }
}
