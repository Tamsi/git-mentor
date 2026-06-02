#!/usr/bin/env node
import { AnalysisPipeline, CoachingService, formatProfileImprovementsMarkdown, formatRepoAnalysisMarkdown, formatTrendingReposMarkdown, parseRepoTarget } from "@git-mentor/agents";
import { listRoles, loadConfig, renderMarkdown } from "@git-mentor/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const config = loadConfig();
const pipeline = new AnalysisPipeline(config);
const coaching = new CoachingService(config);

const server = new McpServer({ name: "git-mentor", version: "0.1.0" });

function reposFromResult(result: Awaited<ReturnType<AnalysisPipeline["runProfile"]>>) {
  const repos = (result.signals as { _repos?: import("@git-mentor/core").GitHubRepoData[] })._repos;
  return repos ? { user: { login: result.profile.username }, repos } : undefined;
}

server.tool(
  "analyze_profile",
  "Analyze a public GitHub career profile (metadata: repos, languages, topics — no code/manifest scan)",
  { username: z.string(), role: z.string().default("ai-engineer") },
  async ({ username, role }) => {
    const result = await pipeline.runProfile({ username: username.replace(/^@/, ""), roleId: role });
    return { content: [{ type: "text", text: renderMarkdown(result) }] };
  },
);

server.tool(
  "compare_role",
  "Compare a GitHub profile against a target role",
  { username: z.string(), role: z.string().default("ai-engineer") },
  async ({ username, role }) => {
    const result = await pipeline.runProfile({
      username: username.replace(/^@/, ""),
      roleId: role,
      includeCoach: true,
      includeGrowth: false,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result.gapAnalysis ?? {}, null, 2) }],
    };
  },
);

server.tool(
  "get_recommendations",
  "Return personalized growth recommendations",
  { username: z.string(), role: z.string().default("ai-engineer") },
  async ({ username, role }) => {
    const result = await pipeline.runProfile({ username: username.replace(/^@/, ""), roleId: role });
    return {
      content: [{ type: "text", text: JSON.stringify(result.actionPlan ?? {}, null, 2) }],
    };
  },
);

server.tool(
  "discover_trending_repos",
  "Find trending GitHub repositories aligned with a developer's expertise domains and stack",
  {
    username: z.string(),
    role: z.string().default("ai-engineer"),
    limit: z.number().min(1).max(15).default(8),
  },
  async ({ username, role, limit }) => {
    const result = await pipeline.runProfile({
      username: username.replace(/^@/, ""),
      roleId: role,
      includeGrowth: false,
    });
    const repos = await coaching.discoverTrending(result.profile, result.gapAnalysis, limit);
    return {
      content: [
        {
          type: "text",
          text: `# Trending repos for @${result.profile.username}\n\n${formatTrendingReposMarkdown(repos)}`,
        },
      ],
    };
  },
);

server.tool(
  "improve_profile",
  "Generate an actionable plan to improve a GitHub profile (bio, pins, README, OSS, portfolio)",
  { username: z.string(), role: z.string().default("ai-engineer") },
  async ({ username, role }) => {
    const result = await pipeline.runProfile({ username: username.replace(/^@/, ""), roleId: role });
    const items =
      result.actionPlan?.profileImprovements ??
      coaching.buildProfileImprovements(result.profile, result.gapAnalysis, reposFromResult(result));
    return {
      content: [
        {
          type: "text",
          text: `# Profile improvements — @${result.profile.username}\n\n${formatProfileImprovementsMarkdown(items)}`,
        },
      ],
    };
  },
);

server.tool(
  "analyze_repository",
  "Deep-scan a single repository (manifests, dependencies, stack signals)",
  {
    owner: z.string(),
    repo: z.string(),
  },
  async ({ owner, repo }) => {
    const result = await pipeline.runRepo({ owner, repoName: repo });
    return {
      content: [{ type: "text", text: formatRepoAnalysisMarkdown(result) }],
    };
  },
);

server.tool(
  "analyze_repository_for_user",
  "Deep-scan a repository owned by a user (shorthand: username + repo name)",
  { username: z.string(), repo: z.string() },
  async ({ username, repo }) => {
    const { owner, repo: repoName } = parseRepoTarget(repo, username.replace(/^@/, ""));
    const result = await pipeline.runRepo({ owner, repoName });
    return {
      content: [{ type: "text", text: formatRepoAnalysisMarkdown(result) }],
    };
  },
);

server.tool("list_target_roles", "List available career target roles", {}, async () => ({
  content: [{ type: "text", text: JSON.stringify(listRoles(), null, 2) }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
