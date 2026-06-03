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
import { formatCommandError, isProfileAnalyzeTarget, stripAtUsername } from "./command-utils.js";
import { runFollowProfilesOnGitHub, stripGitHubUsername } from "./github-follow.js";
import {
  formatFollowersMcpMarkdown,
  formatFollowingMcpMarkdown,
  listDiscussionsRepoMarkdown,
  listFollowersViaGitHubMcp,
  listFollowingViaGitHubMcp,
  listMyDiscussionsMarkdown,
} from "./github-mcp.js";
import { handleGitHubAuthCommand } from "./github-auth.js";
import { formatGithubToolResult, invokeGithubTool } from "./github-tool-bridge.js";
import { APPLY_USAGE, applyBio, applyPin, applyReadme } from "./github-apply.js";
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
      if (userArg) ctx.setUsername(stripAtUsername(userArg));

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
        `${formatTrendingReposMarkdown(repos)}\n\nFork with \`/fork owner/repo\`. See role models with \`/follow\`.`,
      ),
      toolUsed: "trending",
    };
  },

  following: async (ctx, args) => {
    const target = args[0] ? stripGitHubUsername(args[0]) : ctx.getUsername();
    try {
      const result = await listFollowingViaGitHubMcp(
        ctx.config,
        target.toLowerCase() === ctx.getUsername().toLowerCase() ? undefined : target,
      );
      return {
        content: formatFollowingMcpMarkdown(result),
        toolUsed: "following",
      };
    } catch (error) {
      return { content: formatCommandError(error), toolUsed: "following" };
    }
  },

  followers: async (ctx, args) => {
    const target = args[0] ? stripGitHubUsername(args[0]) : ctx.getUsername();
    try {
      const result = await listFollowersViaGitHubMcp(
        ctx.config,
        target.toLowerCase() === ctx.getUsername().toLowerCase() ? undefined : target,
      );
      return {
        content: formatFollowersMcpMarkdown(result),
        toolUsed: "followers",
      };
    } catch (error) {
      return { content: formatCommandError(error), toolUsed: "followers" };
    }
  },

  discussions: async (ctx, args) => {
    const joined = args.join(" ").trim();
    if (!joined || joined === "help") {
      return {
        content: [
          "**Discussions**",
          "- `/discussions` — recent threads on your owned repos",
          "- `/discussions owner/repo` — list threads in one repo",
          "- `/discussions community` — latest threads on [community/community](https://github.com/orgs/community/discussions)",
          "- `/discuss create owner/repo Title | Body` — new thread (confirm intent)",
          "- `/discuss reply owner/repo NUMBER | comment` — reply on thread #NUMBER",
        ].join("\n"),
        toolUsed: "discussions",
      };
    }

    if (joined.toLowerCase() === "community") {
      try {
        const body = await listDiscussionsRepoMarkdown(ctx.config, "community", "community", 15);
        return { content: formatToolResult("Community discussions", body), toolUsed: "discussions" };
      } catch (error) {
        return { content: formatCommandError(error), toolUsed: "discussions" };
      }
    }

    if (!joined.includes("/")) {
      try {
        const body = await listMyDiscussionsMarkdown(ctx.config, ctx.getUsername());
        return { content: formatToolResult("Your discussions", body), toolUsed: "discussions" };
      } catch (error) {
        return { content: formatCommandError(error), toolUsed: "discussions" };
      }
    }

    const [owner, repo] = joined.split("/");
    try {
      const body = await listDiscussionsRepoMarkdown(ctx.config, owner!, repo!, 20);
      return {
        content: formatToolResult(`Discussions — ${owner}/${repo}`, body),
        toolUsed: "discussions",
      };
    } catch (error) {
      return { content: formatCommandError(error), toolUsed: "discussions" };
    }
  },

  discuss: async (ctx, args) => {
    const sub = args[0]?.toLowerCase();
    if (sub === "create") {
      const rest = args.slice(1).join(" ");
      const pipe = rest.indexOf("|");
      const repoPart = pipe >= 0 ? rest.slice(0, pipe).trim() : rest;
      const bodyPart = pipe >= 0 ? rest.slice(pipe + 1).trim() : "";
      const [owner, repo, ...titleParts] = repoPart.split(/\s+/);
      const title = titleParts.join(" ");
      if (!owner || !repo || !title || !bodyPart) {
        return {
          content: "Usage: `/discuss create owner/repo Title here | Body markdown`",
          toolUsed: "discuss",
        };
      }
      try {
        const raw = formatGithubToolResult(
          await invokeGithubTool(ctx.config, "create_discussion", {
            owner,
            repo,
            title,
            body: bodyPart,
          }),
        );
        return { content: formatToolResult("Discussion created", raw), toolUsed: "discuss" };
      } catch (error) {
        return { content: formatCommandError(error), toolUsed: "discuss" };
      }
    }

    if (sub === "reply") {
      const rest = args.slice(1).join(" ");
      const pipe = rest.indexOf("|");
      const head = pipe >= 0 ? rest.slice(0, pipe).trim() : rest;
      const body = pipe >= 0 ? rest.slice(pipe + 1).trim() : "";
      const match = head.match(/^([\w.-]+)\/([\w.-]+)\s+(\d+)$/);
      if (!match || !body) {
        return {
          content: "Usage: `/discuss reply owner/repo 123 | Your comment`",
          toolUsed: "discuss",
        };
      }
      try {
        const raw = formatGithubToolResult(
          await invokeGithubTool(ctx.config, "create_discussion_comment", {
            owner: match[1]!,
            repo: match[2]!,
            discussion_number: Number(match[3]),
            body,
          }),
        );
        return { content: formatToolResult("Comment posted", raw), toolUsed: "discuss" };
      } catch (error) {
        return { content: formatCommandError(error), toolUsed: "discuss" };
      }
    }

    return { content: "Use `/discussions help` or `/discuss create` / `/discuss reply`.", toolUsed: "discuss" };
  },

  follow: async (ctx, args, onProgress) => {
    const profileAnalysis = ctx.getProfileAnalysis();
    if (!profileAnalysis) return { content: NEED_ANALYSIS_MESSAGE };

    const sub = args[0]?.toLowerCase();
    const cached = profileAnalysis.actionPlan?.github.profiles ?? [];

    if (sub === "apply" || sub === "all") {
      return runFollowProfilesOnGitHub({
        config: ctx.config,
        usernames: cached.map((profile) => profile.username),
        onProgress,
      });
    }

    const explicitUsers = args
      .filter((token) => {
        const lower = token.toLowerCase();
        return lower !== "refresh" && lower !== "apply" && lower !== "all";
      })
      .map(stripGitHubUsername)
      .filter(Boolean);

    if (explicitUsers.length > 0) {
      return runFollowProfilesOnGitHub({
        config: ctx.config,
        usernames: explicitUsers,
        onProgress,
      });
    }

    if (sub !== "refresh" && cached.length > 0) {
      return {
        content: formatToolResult(
          `Profiles to follow (${ctx.getRoleId()})`,
          `${formatProfilesToFollowMarkdown(cached)}\n\nFollow on GitHub: \`/follow apply\` or ask in chat to use \`follow_user\`.`,
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
        `${formatProfilesToFollowMarkdown(profiles)}\n\nStudy their pinned repos, README style, and contribution patterns.\nFollow on GitHub: \`/follow apply\`.`,
      ),
      toolUsed: "follow",
    };
  },

  fork: async (ctx, args, onProgress) => ctx.runForkCommand(args.join(" "), onProgress),

  apply: async (ctx, args) => {
    const sub = args[0]?.toLowerCase();
    if (!sub || sub === "help") {
      return { content: APPLY_USAGE, toolUsed: "apply" };
    }
    try {
      if (sub === "bio") {
        const text = args.slice(1).join(" ").trim();
        if (!text) return { content: "Usage: `/apply bio Your bio text here`", toolUsed: "apply" };
        return applyBio(ctx.config, ctx.getUsername(), text);
      }
      if (sub === "readme") {
        const rest = args.slice(1);
        let repoTarget: string | undefined;
        let contentStart = 0;
        if (rest[0]?.includes("/")) {
          repoTarget = rest[0];
          contentStart = 1;
        }
        const content = rest.slice(contentStart).join("\n").trim();
        if (!content) {
          return {
            content:
              "Usage: `/apply readme <markdown>` or `/apply readme owner/repo <markdown>`",
            toolUsed: "apply",
          };
        }
        return applyReadme(ctx.config, ctx.getUsername(), content, repoTarget);
      }
      if (sub === "pin") {
        const repos = args.slice(1).filter(Boolean);
        if (repos.length === 0) {
          return { content: "Usage: `/apply pin owner/repo [owner/repo …]` (max 6)", toolUsed: "apply" };
        }
        return applyPin(ctx.config, ctx.getUsername(), repos);
      }
      return { content: `Unknown /apply subcommand \`${sub}\`. ${APPLY_USAGE}`, toolUsed: "apply" };
    } catch (error) {
      return { content: formatCommandError(error), toolUsed: "apply" };
    }
  },

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
        const server = args[1]!.toLowerCase();
        const result =
          server === "github"
            ? formatGithubToolResult(await invokeGithubTool(ctx.config, args[2]!, parsed))
            : await callExternalMcpTool(ctx.config, args[1]!, args[2]!, parsed);
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

  login: async (_ctx, args) => {
    const sub = args[0]?.toLowerCase();
    if (sub && !["gh", "github", "ollama", "both", "all"].includes(sub)) {
      return {
        content: "Usage: **`/login`** (GitHub + Ollama) · **`/login gh`** · **`/login ollama`**",
      };
    }
    return {
      content:
        "Open the login flow in this UI with **`/login`** (both), **`/login gh`**, or **`/login ollama`**. Shell: **`gitmentor login`**.",
      toolUsed: "login",
    };
  },

  signin: async () => ({
    content: "Same as **`/login ollama`** — run that to sign in to Ollama cloud.",
    toolUsed: "signin",
  }),

  help: async () => ({
    content: [
      ANALYZE_USAGE,
      "",
      "**Other commands**",
      "- /role <id> — set target role",
      "- /login — GitHub + Ollama (default) · /login gh · /login ollama",
      "- /signin — alias for /login ollama",
      "- /model — pick LLM model (↑↓ Enter)",
      "- /model <name> — set model directly (e.g. /model qwen3:8b)",
      "- /gaps — career gap analysis (requires /analyze profile)",
      "- /growth — recommendations",
      "- /trending — discover trending repos",
      "- /following — accounts you follow · /followers — your followers",
      "- /follow — role models · /follow apply — follow on GitHub",
      "- /discussions — forum threads · /discuss create|reply",
      "- /fork <repo> — fork via GitHub MCP",
      "- /apply — write to your GitHub (bio, README, pins) — `/apply help`",
      "- /improve — GitHub profile improvement plan",
      "- /export — save Markdown dossier",
      "- /rules — list coaching rules · /rules reload · /rules on|off",
      "- /skills — list skills · /skills use <id> · /skills off <id>",
      "- /mcp — MCP servers and external tool bridge",
      "- /auth — GitHub status · /auth login · /auth refresh",
      "- Shell: `gitmentor login` · `gitmentor login gh` · `gitmentor login ollama` · `gitmentor auth`",
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
