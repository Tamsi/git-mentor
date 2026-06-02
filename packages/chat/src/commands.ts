import {
  CoachingService,
  formatProfileImprovementsMarkdown,
  formatProfilesToFollowMarkdown,
  formatTrendingReposMarkdown,
} from "@git-mentor/agents";
import {
  type AgentContextBundle,
  type AnalysisResult,
  type GitMentorConfig,
  type TrendingRepo,
  ensureDirs,
  formatRulesList,
  formatSkillsList,
  getGithubProfileData,
  listRoles,
  saveConfig,
  saveProfileDossier,
} from "@git-mentor/core";
import { handleModelCommand } from "@git-mentor/llm";
import {
  callExternalMcpTool,
  formatMcpServersList,
  listExternalMcpTools,
} from "./mcp-client.js";
import { formatToolResult, NEED_ANALYSIS_MESSAGE } from "./prompts.js";
import { formatCommandError, isProfileAnalyzeTarget } from "./command-utils.js";
import { runFollowProfilesOnGitHub } from "./github-follow.js";
import { handleGitHubAuthCommand } from "./github-auth.js";
import type { ChatReply, ProgressCallback } from "./types.js";

export const ANALYZE_USAGE = [
  "**Analyze usage**",
  "- `/analyze profile` — refresh **profile attractiveness** audit: bio, profile README, pins, stats, activity, portfolio presentation. **No manifest/code scan.**",
  "- `/analyze me` — same as `/analyze profile`",
  "- `/analyze profile @user` — same for another user",
  "- `/analyze <repo>` — deep repository analysis (manifests, dependencies), e.g. `/analyze redbee-mcp` or `/analyze owner/repo`",
].join("\n");

export interface CommandContext {
  config: GitMentorConfig;
  coaching: CoachingService;
  getUsername(): string;
  setUsername(username: string): void;
  getRoleId(): string;
  setRoleId(roleId: string): void;
  getProfileAnalysis(): AnalysisResult | null;
  getAgentBundle(): AgentContextBundle;
  reloadAgentContext(): void;
  pushHistory(role: "user" | "assistant", content: string): void;
  refreshLlmClients(): void;
  syncOllamaModel(onProgress?: ProgressCallback): Promise<void>;
  runProfileAnalysis(onProgress?: ProgressCallback): Promise<string>;
  runRepoAnalysis(repoArg: string, onProgress?: ProgressCallback): Promise<ChatReply>;
  runForkCommand(repoArg: string, onProgress?: ProgressCallback): Promise<ChatReply>;
  trendingReposForFork(): TrendingRepo[];
}

type CommandHandler = (ctx: CommandContext, args: string[], onProgress?: ProgressCallback) => Promise<ChatReply>;

const handlers: Record<string, CommandHandler> = {
  analyze: async (ctx, args, onProgress) => {
    if (args.length === 0 || args[0]?.toLowerCase() === "help") {
      return { content: ANALYZE_USAGE };
    }

    const first = args[0]!.toLowerCase();
    if (isProfileAnalyzeTarget(first)) {
      const userArg = args[0]?.toLowerCase() === "profile" ? args[1] : args[1];
      if (userArg?.replace(/^@/, "")) ctx.setUsername(userArg.replace(/^@/, ""));

      try {
        const opening = await ctx.runProfileAnalysis(onProgress);
        ctx.pushHistory("assistant", opening);
        return {
          content: opening,
          toolUsed: "analyze-profile",
          analysis: ctx.getProfileAnalysis() ?? undefined,
        };
      } catch (error) {
        return {
          content: formatCommandError(error, `@${ctx.getUsername()}`),
          toolUsed: "analyze-profile",
        };
      }
    }

    return ctx.runRepoAnalysis(args.join(" "), onProgress);
  },

  role: async (ctx, args) => {
    const arg = args.join(" ").trim();
    if (!arg) {
      return {
        content: `Current role: **${ctx.getRoleId()}**\nAvailable: ${listRoles().map((r) => r.id).join(", ")}`,
      };
    }
    ctx.setRoleId(arg);
    ctx.config.defaultRole = arg;
    const hint = ctx.getProfileAnalysis()
      ? "Target role updated. Run **`/analyze profile`** to refresh gap analysis for the new role."
      : "Target role updated.";
    return { content: formatToolResult(`Target role → ${ctx.getRoleId()}`, hint), toolUsed: "role" };
  },

  model: async (ctx, args, onProgress) => {
    const result = await handleModelCommand(ctx.config, args);
    if (result.changed) {
      saveConfig(ctx.config);
      ctx.refreshLlmClients();
      await ctx.syncOllamaModel(onProgress);
      return { content: formatToolResult("Model updated", result.message), toolUsed: "model" };
    }
    return { content: result.message, toolUsed: "model" };
  },

  gaps: async (ctx) => {
    const profileAnalysis = ctx.getProfileAnalysis();
    if (!profileAnalysis) return { content: NEED_ANALYSIS_MESSAGE };
    const gaps = profileAnalysis.gapAnalysis;
    if (!gaps) return { content: "No gap analysis yet. Run **`/analyze profile`**." };
    const body = gaps.gaps
      .map((g) => `- **${g.area}** (${g.currentLevel} → ${g.targetLevel}): ${g.rationale}`)
      .join("\n");
    return {
      content: formatToolResult(`Gaps vs ${gaps.targetRole} (${gaps.fitScore}/10)`, `${gaps.summary}\n\n${body}`),
      toolUsed: "gaps",
    };
  },

  growth: async (ctx) => {
    const profileAnalysis = ctx.getProfileAnalysis();
    if (!profileAnalysis) return { content: NEED_ANALYSIS_MESSAGE };
    const recs = profileAnalysis.actionPlan?.recommendations ?? [];
    const body = recs.map((r) => `- **${r.title}** [${r.effort}] — ${r.description}`).join("\n");
    const tech = profileAnalysis.actionPlan?.technologiesToLearn.join(", ") ?? "";
    return {
      content: formatToolResult(
        "Growth recommendations",
        `${body || "No recommendations yet."}${tech ? `\n\nLearn next: ${tech}` : ""}`,
      ),
      toolUsed: "growth",
    };
  },

  trending: async (ctx, _args, onProgress) => {
    const profileAnalysis = ctx.getProfileAnalysis();
    if (!profileAnalysis) return { content: NEED_ANALYSIS_MESSAGE };
    onProgress?.("Searching trending repos in your domains…");
    const repos = await ctx.coaching.discoverTrending(profileAnalysis.profile, profileAnalysis.gapAnalysis);
    if (profileAnalysis.actionPlan) {
      profileAnalysis.actionPlan.github.repos = repos;
    }
    return {
      content: formatToolResult(
        "Trending repos for your expertise",
        `${formatTrendingReposMarkdown(repos)}\n\nFork one with \`/fork owner/repo\` or \`fork reponame\` (uses GitHub MCP).\nSee role models with \`/follow\`.`,
      ),
      toolUsed: "trending",
    };
  },

  follow: async (ctx, args, onProgress) => {
    const profileAnalysis = ctx.getProfileAnalysis();
    if (!profileAnalysis) return { content: NEED_ANALYSIS_MESSAGE };

    const sub = args[0]?.toLowerCase();
    const cached = profileAnalysis.actionPlan?.github.profiles ?? [];

    if (sub === "apply" || sub === "all") {
      return runFollowProfilesOnGitHub({
        config: ctx.config,
        input: "follow apply",
        cachedProfiles: cached,
        onProgress,
      });
    }

    if (sub !== "refresh" && cached.length > 0) {
      return {
        content: formatToolResult(
          `Profiles to follow (${ctx.getRoleId()})`,
          `${formatProfilesToFollowMarkdown(cached)}\n\nFollow on GitHub: \`/follow apply\` or say \`follow them\` / \`follow those profiles\`.`,
        ),
        toolUsed: "follow",
      };
    }

    onProgress?.("Finding role models and maintainers aligned with your target role…");
    const trendingRepos =
      profileAnalysis.actionPlan?.github.repos ??
      (await ctx.coaching.discoverTrending(profileAnalysis.profile, profileAnalysis.gapAnalysis, 6));
    const profiles = await ctx.coaching.discoverProfilesToFollow(
      profileAnalysis.profile,
      ctx.getRoleId(),
      { gapAnalysis: profileAnalysis.gapAnalysis, trendingRepos },
    );
    if (profileAnalysis.actionPlan) {
      profileAnalysis.actionPlan.github.profiles = profiles;
    }
    return {
      content: formatToolResult(
        `Profiles to follow (${ctx.getRoleId()})`,
        `${formatProfilesToFollowMarkdown(profiles)}\n\nStudy their pinned repos, README style, and contribution patterns.\nFollow on GitHub: \`/follow apply\` or \`follow them\`.`,
      ),
      toolUsed: "follow",
    };
  },

  fork: async (ctx, args, onProgress) => ctx.runForkCommand(args.join(" "), onProgress),

  improve: async (ctx) => {
    const profileAnalysis = ctx.getProfileAnalysis();
    if (!profileAnalysis) return { content: NEED_ANALYSIS_MESSAGE };
    const items =
      profileAnalysis.actionPlan?.profileImprovements ??
      ctx.coaching.buildProfileImprovements(
        profileAnalysis.profile,
        profileAnalysis.gapAnalysis,
        getGithubProfileData(profileAnalysis),
      );
    return {
      content: formatToolResult("Profile improvement plan", formatProfileImprovementsMarkdown(items)),
      toolUsed: "improve",
    };
  },

  export: async (ctx) => {
    const profileAnalysis = ctx.getProfileAnalysis();
    if (!profileAnalysis) return { content: NEED_ANALYSIS_MESSAGE };
    ensureDirs();
    const paths = saveProfileDossier(profileAnalysis, ctx.getRoleId());
    return {
      content: `Profile dossier exported to \`${paths.markdown}\` (JSON: \`${paths.json}\`)`,
      toolUsed: "export",
    };
  },

  rules: async (ctx, args) => {
    const sub = args[0]?.toLowerCase();
    const agentBundle = ctx.getAgentBundle();

    if (sub === "reload") {
      ctx.reloadAgentContext();
      const bundle = ctx.getAgentBundle();
      return {
        content: formatToolResult(
          "Rules reloaded",
          `${bundle.rules.length} rule(s) loaded.\n\n${formatRulesList(bundle.rules)}`,
        ),
        toolUsed: "rules",
      };
    }
    if (sub === "off") {
      ctx.config.agent.rulesEnabled = false;
      saveConfig(ctx.config);
      return { content: "User rules disabled for LLM prompts. Run `/rules on` to re-enable.", toolUsed: "rules" };
    }
    if (sub === "on") {
      ctx.config.agent.rulesEnabled = true;
      saveConfig(ctx.config);
      return { content: "User rules enabled for LLM prompts.", toolUsed: "rules" };
    }
    return {
      content: formatToolResult(
        `Rules (${ctx.config.agent.rulesEnabled ? "enabled" : "disabled"})`,
        `${formatRulesList(agentBundle.rules)}\n\nAdd \`.md\` files to \`~/.config/git-mentor/rules/\` or \`.git-mentor/rules/\`. Commands: \`/rules reload\`, \`/rules on|off\`.`,
      ),
      toolUsed: "rules",
    };
  },

  skills: async (ctx, args) => {
    const sub = args[0]?.toLowerCase();
    const skillId = args[1];

    if (sub === "use" && skillId) {
      const agentBundle = ctx.getAgentBundle();
      if (!agentBundle.skills.some((skill) => skill.id === skillId)) {
        return { content: `Unknown skill \`${skillId}\`. Run \`/skills\` to list available skills.` };
      }
      if (!ctx.config.agent.activeSkills.includes(skillId)) {
        ctx.config.agent.activeSkills.push(skillId);
        saveConfig(ctx.config);
      }
      ctx.reloadAgentContext();
      return {
        content: formatToolResult(`Skill activated: ${skillId}`, formatSkillsList(ctx.getAgentBundle())),
        toolUsed: "skills",
      };
    }

    if (sub === "off" && skillId) {
      ctx.config.agent.activeSkills = ctx.config.agent.activeSkills.filter((id) => id !== skillId);
      saveConfig(ctx.config);
      ctx.reloadAgentContext();
      return {
        content: formatToolResult(`Skill deactivated: ${skillId}`, formatSkillsList(ctx.getAgentBundle())),
        toolUsed: "skills",
      };
    }

    if (sub === "reload") {
      ctx.reloadAgentContext();
      return {
        content: formatToolResult("Skills reloaded", formatSkillsList(ctx.getAgentBundle())),
        toolUsed: "skills",
      };
    }

    return {
      content: formatToolResult(
        `Skills (${ctx.config.agent.skillsEnabled ? "enabled" : "disabled"})`,
        `${formatSkillsList(ctx.getAgentBundle())}\n\nCommands: \`/skills use <id>\`, \`/skills off <id>\`, \`/skills reload\`.`,
      ),
      toolUsed: "skills",
    };
  },

  mcp: async (ctx, args, onProgress) => {
    const sub = args[0]?.toLowerCase();
    if (!sub || sub === "list") {
      return { content: formatMcpServersList(ctx.config), toolUsed: "mcp" };
    }
    if (sub === "tools" && args[1]) {
      try {
        onProgress?.(`Listing tools for MCP server ${args[1]}…`);
        const tools = await listExternalMcpTools(ctx.config, args[1]!);
        const body = tools
          .map((tool) => `- \`${tool.name}\`${tool.description ? ` — ${tool.description}` : ""}`)
          .join("\n");
        return {
          content: formatToolResult(`Tools — ${args[1]}`, body || "No tools returned."),
          toolUsed: "mcp",
        };
      } catch (error) {
        return { content: formatCommandError(error), toolUsed: "mcp" };
      }
    }
    if (sub === "call" && args[1] && args[2]) {
      const jsonArg = args.slice(3).join(" ");
      let parsed: Record<string, unknown> = {};
      if (jsonArg) {
        try {
          parsed = JSON.parse(jsonArg) as Record<string, unknown>;
        } catch {
          return {
            content: 'Invalid JSON arguments. Example: `/mcp call github search_repositories {"query":"mcp"}`',
          };
        }
      }
      try {
        onProgress?.(`Calling ${args[1]}.${args[2]}…`);
        const result = await callExternalMcpTool(ctx.config, args[1]!, args[2]!, parsed);
        return {
          content: formatToolResult(`MCP ${args[1]}.${args[2]}`, result),
          toolUsed: "mcp",
        };
      } catch (error) {
        return { content: formatCommandError(error), toolUsed: "mcp" };
      }
    }
    return {
      content: [
        "**MCP commands**",
        "- `/mcp` — list built-in and configured MCP servers",
        "- `/mcp tools <server>` — list tools from an external server",
        "- `/mcp call <server> <tool> [json]` — invoke an external tool",
        "",
        "MCP tool reference: `~/.config/git-mentor/mcp/tools.md` (after `gitmentor init`).",
        "Run `gitmentor mcp` to expose git-mentor tools to Cursor.",
      ].join("\n"),
      toolUsed: "mcp",
    };
  },

  auth: async (ctx, args) => handleGitHubAuthCommand(ctx, args),

  help: async () => ({
    content: [
      ANALYZE_USAGE,
      "",
      "**Other commands**",
      "- /role <id> — set target role",
      "- /model — pick LLM model (↑↓ Enter) · /model signin — Ollama cloud login",
      "- /model <name> — set model directly (e.g. /model qwen3:8b)",
      "- /gaps — career gap analysis (requires /analyze profile)",
      "- /growth — recommendations",
      "- /trending — discover trending repos",
      "- /follow — list role models · /follow apply — follow them on GitHub",
      "- /fork <repo> — fork via GitHub MCP (after /trending or owner/repo)",
      "- /improve — GitHub profile improvement plan",
      "- /export — save Markdown dossier",
      "- /rules — list coaching rules · /rules reload · /rules on|off",
      "- /skills — list skills · /skills use <id> · /skills off <id>",
      "- /mcp — MCP servers and external tool bridge",
      "- /auth — GitHub status · /auth login · /auth refresh (gh OAuth)",
      "- /help · /quit",
      "",
      "Free-form chat works once your profile is loaded (automatic with `gh auth`).",
    ].join("\n"),
  }),

  quit: async () => ({ content: "__EXIT__" }),
  exit: async () => ({ content: "__EXIT__" }),
};

export async function dispatchCommand(
  ctx: CommandContext,
  command: string,
  onProgress?: ProgressCallback,
): Promise<ChatReply> {
  const [cmd, ...args] = command.slice(1).split(/\s+/);
  const handler = handlers[cmd?.toLowerCase() ?? ""];
  if (!handler) return { content: `Unknown command /${cmd}. Type /help.` };
  return handler(ctx, args, onProgress);
}
