import {
  AnalysisPipeline,
  CoachingService,
  formatProfileImprovementsMarkdown,
  formatRepoAnalysisMarkdown,
  formatTrendingReposMarkdown,
  parseRepoTarget,
} from "@git-mentor/agents";
import {
  type AnalysisResult,
  type GitMentorConfig,
  type RepoAnalysisResult,
  type AgentContextBundle,
  formatAgentContextForPrompt,
  formatRulesList,
  formatSkillsList,
  loadAgentContext,
  loadProfileDossier,
  profileDossierPaths,
  saveProfileDossier,
  listRoles,
  ensureDirs,
  saveConfig,
} from "@git-mentor/core";
import { hasGitHubAuth, ensureGitHubMcpServer } from "@git-mentor/github";
import { LLMRouter, handleModelCommand, type ChatMessage, type LlmUsage, ensureOllamaModel, fetchOllamaContextLimit } from "@git-mentor/llm";
import {
  buildDeterministicOpening,
  buildProfileReadyMessage,
  buildSystemPrompt,
  buildWelcomeMessage,
  formatToolResult,
  messagesForChat,
  NEED_ANALYSIS_MESSAGE,
  OPENING_USER_PROMPT,
} from "./prompts.js";
import { buildContextSnapshot, type ContextSnapshot } from "./context-stats.js";
import {
  callExternalMcpTool,
  formatMcpServersList,
  listExternalMcpTools,
} from "./mcp-client.js";
import {
  forkRepositoryViaGitHubMcp,
  formatGitHubMcpActionsHint,
  resolveForkTarget,
} from "./github-mcp.js";

export type { ContextSnapshot } from "./context-stats.js";
export { formatContextBar } from "./context-stats.js";

export interface ChatSessionOptions {
  username: string;
  roleId: string;
  config: GitMentorConfig;
}

export interface ChatReply {
  content: string;
  toolUsed?: string;
  analysis?: AnalysisResult;
}

export type ProgressCallback = (message: string) => void;

const ANALYZE_USAGE = [
  "**Analyze usage**",
  "- `/analyze profile` — refresh **profile attractiveness** audit: bio, profile README, pins, stats, activity, portfolio presentation. **No manifest/code scan.**",
  "- `/analyze me` — same as `/analyze profile`",
  "- `/analyze profile @user` — same for another user",
  "- `/analyze <repo>` — deep repository analysis (manifests, dependencies), e.g. `/analyze redbee-mcp` or `/analyze owner/repo`",
].join("\n");

export function isProfileAnalyzeTarget(value: string): boolean {
  const normalized = value.toLowerCase().replace(/^@/, "");
  return normalized === "profile" || normalized === "me" || normalized === "self";
}

export function formatCommandError(error: unknown, context?: string): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Ollama error")) {
    return `LLM error: ${message.replace(/^Ollama error: /, "")}`;
  }

  const status = (error as { status?: number })?.status;
  if (status === 404) {
    return context
      ? `Repository **${context}** not found. Check the name or use \`/analyze profile\` for your GitHub career profile.`
      : "GitHub resource not found. Use `/analyze profile` for your career profile.";
  }

  return `Error: ${message}`;
}

/** @deprecated Use formatCommandError */
export function formatGitHubError(error: unknown, context?: string): string {
  return formatCommandError(error, context);
}

function formatLlmFallbackNote(): string {
  return "_Profile loaded. LLM unavailable — rule-based summary shown._";
}

export class ChatSession {
  private pipeline: AnalysisPipeline;
  private coaching: CoachingService;
  private router: LLMRouter;
  private history: ChatMessage[] = [];
  private profileAnalysis: AnalysisResult | null = null;
  private repoAnalyses = new Map<string, RepoAnalysisResult>();
  private roleId: string;
  private contextLimit?: number;
  private lastUsage?: LlmUsage;
  private sessionPromptTokens = 0;
  private sessionCompletionTokens = 0;
  private agentBundle: AgentContextBundle;

  constructor(
    private config: GitMentorConfig,
    private username: string,
    roleId?: string,
  ) {
    this.pipeline = new AnalysisPipeline(config);
    this.coaching = new CoachingService(config);
    this.router = new LLMRouter(config);
    this.roleId = roleId ?? config.defaultRole;
    this.agentBundle = loadAgentContext(this.config);
    this.ensureGitHubMcp();
  }

  private reloadAgentContext(): void {
    this.agentBundle = loadAgentContext(this.config);
  }

  private getAgentPromptSection(): string {
    return formatAgentContextForPrompt(this.agentBundle, this.config);
  }

  private buildSessionSystemPrompt(): string {
    if (!this.profileAnalysis) return "";
    const agentSection = this.getAgentPromptSection();
    const githubMcpSection = formatGitHubMcpActionsHint(this.config);
    const combinedAgent = [agentSection, githubMcpSection].filter(Boolean).join("\n\n");
    return buildSystemPrompt(
      this.profileAnalysis,
      this.roleId,
      [...this.repoAnalyses.values()],
      combinedAgent,
    );
  }

  private ensureGitHubMcp(): void {
    if (ensureGitHubMcpServer(this.config)) {
      saveConfig(this.config);
    }
  }

  private trendingReposForFork(): import("@git-mentor/core").TrendingRepo[] {
    return this.profileAnalysis?.actionPlan?.trendingRepos ?? [];
  }

  private async runForkCommand(repoArg: string, onProgress?: ProgressCallback): Promise<ChatReply> {
    if (!repoArg.trim()) {
      return {
        content: "Usage: `/fork owner/repo` or `/fork reponame` (matches last `/trending` list).",
        toolUsed: "fork",
      };
    }

    this.ensureGitHubMcp();

    const target = resolveForkTarget(repoArg, this.trendingReposForFork());
    if (!target) {
      return {
        content: formatToolResult(
          "Could not resolve repository",
          `Unknown repo \`${repoArg}\`. Use \`owner/repo\` or run \`/trending\` first, then \`/fork reponame\`.`,
        ),
        toolUsed: "fork",
      };
    }

    try {
      onProgress?.(`Forking ${target.owner}/${target.repo} via GitHub MCP…`);
      const result = await forkRepositoryViaGitHubMcp(this.config, target.owner, target.repo);
      return {
        content: formatToolResult(
          `Forked ${target.owner}/${target.repo}`,
          `${result}\n\nNext: clone your fork, create a branch, and open a PR back to upstream.`,
        ),
        toolUsed: "fork",
      };
    } catch (error) {
      return { content: formatCommandError(error), toolUsed: "fork" };
    }
  }

  private tryGitHubActionInput(input: string, onProgress?: ProgressCallback): Promise<ChatReply> | null {
    const forkMatch = input.match(/^fork\s+(.+)$/i);
    if (forkMatch?.[1]) {
      return this.runForkCommand(forkMatch[1], onProgress);
    }
    return null;
  }

  private refreshLlmClients(): void {
    this.router = new LLMRouter(this.config);
    this.pipeline = new AnalysisPipeline(this.config);
    this.coaching = new CoachingService(this.config);
  }

  private async syncOllamaModel(onProgress?: ProgressCallback): Promise<void> {
    if (this.config.llm.provider !== "ollama") return;
    const ready = await ensureOllamaModel(this.config.llm, onProgress);
    if (ready.changed) {
      this.config.llm.model = ready.model;
      saveConfig(this.config);
      this.refreshLlmClients();
    }
  }

  setModel(model: string): void {
    this.config.llm.model = model;
    saveConfig(this.config);
    this.refreshLlmClients();
    void this.refreshContextLimit();
  }

  async ensureLlmReady(onProgress?: ProgressCallback): Promise<void> {
    await this.syncOllamaModel(onProgress);
    await this.refreshContextLimit();
  }

  private recordUsage(usage?: LlmUsage): void {
    if (!usage) return;
    this.lastUsage = usage;
    this.sessionPromptTokens += usage.promptTokens;
    this.sessionCompletionTokens += usage.completionTokens;
  }

  private resetSessionUsage(): void {
    this.lastUsage = undefined;
    this.sessionPromptTokens = 0;
    this.sessionCompletionTokens = 0;
  }

  async refreshContextLimit(): Promise<void> {
    if (this.config.llm.provider === "ollama") {
      this.contextLimit = await fetchOllamaContextLimit(
        this.config.llm.model,
        this.config.llm.baseUrl,
      );
      return;
    }
    this.contextLimit = this.config.llm.maxTokens > 4096 ? this.config.llm.maxTokens : undefined;
  }

  getContextSnapshot(): ContextSnapshot {
    return buildContextSnapshot({
      profileAnalysis: this.profileAnalysis,
      roleId: this.roleId,
      repoAnalyses: [...this.repoAnalyses.values()],
      history: this.history,
      contextLimit: this.contextLimit,
      lastUsage: this.lastUsage,
      sessionPromptTokens: this.sessionPromptTokens,
      sessionCompletionTokens: this.sessionCompletionTokens,
      agentContextSection: this.getAgentPromptSection(),
    });
  }

  getConfig(): GitMentorConfig {
    return this.config;
  }

  /** @deprecated use profileAnalysis */
  get analysis(): AnalysisResult | null {
    return this.profileAnalysis;
  }

  getContext(): {
    username: string;
    roleId: string;
    analysis: AnalysisResult | null;
    repoAnalyses: RepoAnalysisResult[];
  } {
    return {
      username: this.username,
      roleId: this.roleId,
      analysis: this.profileAnalysis,
      repoAnalyses: [...this.repoAnalyses.values()],
    };
  }

  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  async bootstrap(onProgress?: ProgressCallback): Promise<ChatReply> {
    const cached = loadProfileDossier(this.username, this.roleId, this.config.cacheTtlHours);
    if (cached) {
      this.profileAnalysis = cached;
      this.resetSessionUsage();
      const content = buildProfileReadyMessage(cached, this.roleId, profileDossierPaths(this.username).markdown, {
        fromCache: true,
      });
      this.history.push({ role: "assistant", content });
      return { content, toolUsed: "bootstrap", analysis: cached };
    }

    if (hasGitHubAuth(this.config)) {
      this.ensureGitHubMcp();
      try {
        await this.syncOllamaModel(onProgress);
        const opening = await this.runProfileAnalysis(onProgress);
        const content = buildProfileReadyMessage(
          this.profileAnalysis!,
          this.roleId,
          profileDossierPaths(this.username).markdown,
          { opening },
        );
        this.history.push({ role: "assistant", content });
        return {
          content,
          toolUsed: "bootstrap",
          analysis: this.profileAnalysis ?? undefined,
        };
      } catch (error) {
        const fallback = [
          buildWelcomeMessage(this.username, this.roleId),
          "",
          `_GitHub identity resolved as @${this.username}, but profile analysis failed: ${error instanceof Error ? error.message : String(error)}_`,
          "Try **`/analyze profile`** to retry (GitHub data loads even if the LLM is down).",
        ].join("\n");
        this.history.push({ role: "assistant", content: fallback });
        return { content: fallback, toolUsed: "bootstrap" };
      }
    }

    const content = buildWelcomeMessage(this.username, this.roleId);
    this.history.push({ role: "assistant", content });
    return { content, toolUsed: "bootstrap" };
  }

  async handleInput(input: string, onProgress?: ProgressCallback): Promise<ChatReply> {
    const trimmed = input.trim();
    if (!trimmed) return { content: "" };

    if (trimmed.startsWith("/")) {
      return this.handleCommand(trimmed, onProgress);
    }

    const githubAction = this.tryGitHubActionInput(trimmed, onProgress);
    if (githubAction) {
      return githubAction;
    }

    if (!this.profileAnalysis) {
      return { content: NEED_ANALYSIS_MESSAGE };
    }

    const systemPrompt = this.buildSessionSystemPrompt();
    const messages = messagesForChat(systemPrompt, this.history, trimmed);
    await this.syncOllamaModel(onProgress);
    const reply = await this.router.chat(messages);
    this.recordUsage(reply.usage);

    this.history.push({ role: "user", content: trimmed });
    this.history.push({ role: "assistant", content: reply.content });

    return { content: reply.content, analysis: this.profileAnalysis };
  }

  async *handleInputStream(
    input: string,
    onProgress?: ProgressCallback,
  ): AsyncGenerator<{ type: "token" | "done"; content: string; analysis?: AnalysisResult }> {
    const trimmed = input.trim();
    if (!trimmed) {
      yield { type: "done", content: "" };
      return;
    }

    if (trimmed.startsWith("/")) {
      const reply = await this.handleCommand(trimmed, onProgress);
      yield { type: "token", content: reply.content };
      yield { type: "done", content: reply.content, analysis: reply.analysis };
      return;
    }

    const githubAction = this.tryGitHubActionInput(trimmed, onProgress);
    if (githubAction) {
      const reply = await githubAction;
      yield { type: "token", content: reply.content };
      yield { type: "done", content: reply.content, analysis: reply.analysis };
      return;
    }

    if (!this.profileAnalysis) {
      yield { type: "token", content: NEED_ANALYSIS_MESSAGE };
      yield { type: "done", content: NEED_ANALYSIS_MESSAGE };
      return;
    }

    const systemPrompt = this.buildSessionSystemPrompt();
    const messages = messagesForChat(systemPrompt, this.history, trimmed);
    await this.syncOllamaModel(onProgress);
    let full = "";
    let lastUsage: LlmUsage | undefined;

    for await (const chunk of this.router.chatStream(messages)) {
      full += chunk.content;
      if (chunk.usage) lastUsage = chunk.usage;
      if (chunk.content) yield { type: "token", content: chunk.content };
      if (chunk.done) break;
    }
    this.recordUsage(lastUsage);

    this.history.push({ role: "user", content: trimmed });
    this.history.push({ role: "assistant", content: full });
    yield { type: "done", content: full, analysis: this.profileAnalysis };
  }

  private async runProfileAnalysis(onProgress?: ProgressCallback): Promise<string> {
    onProgress?.(`Analyzing GitHub profile @${this.username}…`);
    await this.syncOllamaModel(onProgress);

    this.profileAnalysis = await this.pipeline.runProfile({
      username: this.username,
      roleId: this.roleId,
      onProgress,
    });
    this.resetSessionUsage();
    saveProfileDossier(this.profileAnalysis, this.roleId);

    onProgress?.("Building coaching brief…");

    if (this.config.llm.provider === "deterministic") {
      return buildDeterministicOpening(this.profileAnalysis, this.roleId);
    }

    const systemPrompt = this.buildSessionSystemPrompt();

    try {
      await this.syncOllamaModel(onProgress);
      const result = await this.router.chat([
        { role: "system", content: systemPrompt },
        { role: "user", content: OPENING_USER_PROMPT },
      ]);
      this.recordUsage(result.usage);
      return result.content.trim() || buildDeterministicOpening(this.profileAnalysis, this.roleId);
    } catch {
      const opening = buildDeterministicOpening(this.profileAnalysis, this.roleId);
      return `${opening}\n\n${formatLlmFallbackNote()}`;
    }
  }

  private async runRepoAnalysis(repoArg: string, onProgress?: ProgressCallback): Promise<ChatReply> {
    const { owner, repo } = parseRepoTarget(repoArg, this.username);
    const fullName = `${owner}/${repo}`;
    try {
      const result = await this.pipeline.runRepo({ owner, repoName: repo, onProgress });
      this.repoAnalyses.set(result.fullName.toLowerCase(), result);

      const body = formatRepoAnalysisMarkdown(result);
      this.history.push({ role: "assistant", content: body });

      return {
        content: body,
        toolUsed: "analyze-repo",
        analysis: this.profileAnalysis ?? undefined,
      };
    } catch (error) {
      return { content: formatCommandError(error, fullName), toolUsed: "analyze-repo" };
    }
  }

  private async runProfileAnalyzeCommand(
    args: string[],
    onProgress?: ProgressCallback,
  ): Promise<ChatReply> {
    const userArg = args[0]?.toLowerCase() === "profile" ? args[1] : args[1];
    if (userArg?.replace(/^@/, "")) this.username = userArg.replace(/^@/, "");

    try {
      const opening = await this.runProfileAnalysis(onProgress);
      this.history.push({ role: "assistant", content: opening });
      return {
        content: opening,
        toolUsed: "analyze-profile",
        analysis: this.profileAnalysis ?? undefined,
      };
    } catch (error) {
      return { content: formatCommandError(error, `@${this.username}`), toolUsed: "analyze-profile" };
    }
  }

  private sourceRepos() {
    const repos = (this.profileAnalysis?.signals as { _repos?: import("@git-mentor/core").GitHubRepoData[] })?._repos;
    return repos ? { user: { login: this.username }, repos } : undefined;
  }

  private async handleCommand(command: string, onProgress?: ProgressCallback): Promise<ChatReply> {
    const [cmd, ...args] = command.slice(1).split(/\s+/);

    switch (cmd?.toLowerCase()) {
      case "analyze": {
        if (args.length === 0 || args[0]?.toLowerCase() === "help") {
          return { content: ANALYZE_USAGE };
        }

        const first = args[0]!.toLowerCase();
        if (isProfileAnalyzeTarget(first)) {
          return this.runProfileAnalyzeCommand(args, onProgress);
        }

        return this.runRepoAnalysis(args.join(" "), onProgress);
      }
      case "role": {
        const arg = args.join(" ").trim();
        if (!arg) {
          return {
            content: `Current role: **${this.roleId}**\nAvailable: ${listRoles().map((r) => r.id).join(", ")}`,
          };
        }
        this.roleId = arg;
        this.config.defaultRole = arg;
        const hint = this.profileAnalysis
          ? "Target role updated. Run **`/analyze profile`** to refresh gap analysis for the new role."
          : "Target role updated.";
        return { content: formatToolResult(`Target role → ${this.roleId}`, hint), toolUsed: "role" };
      }
      case "model": {
        const result = await handleModelCommand(this.config, args);
        if (result.changed) {
          saveConfig(this.config);
          this.refreshLlmClients();
          await this.syncOllamaModel(onProgress);
          return {
            content: formatToolResult("Model updated", result.message),
            toolUsed: "model",
          };
        }
        return { content: result.message, toolUsed: "model" };
      }
      case "gaps": {
        if (!this.profileAnalysis) return { content: NEED_ANALYSIS_MESSAGE };
        const gaps = this.profileAnalysis.gapAnalysis;
        if (!gaps) return { content: "No gap analysis yet. Run **`/analyze profile`**." };
        const body = gaps.gaps.map((g) => `- **${g.area}** (${g.currentLevel} → ${g.targetLevel}): ${g.rationale}`).join("\n");
        return {
          content: formatToolResult(`Gaps vs ${gaps.targetRole} (${gaps.fitScore}/10)`, `${gaps.summary}\n\n${body}`),
          toolUsed: "gaps",
        };
      }
      case "growth": {
        if (!this.profileAnalysis) return { content: NEED_ANALYSIS_MESSAGE };
        const recs = this.profileAnalysis.actionPlan?.recommendations ?? [];
        const body = recs.map((r) => `- **${r.title}** [${r.effort}] — ${r.description}`).join("\n");
        const tech = this.profileAnalysis.actionPlan?.technologiesToLearn.join(", ") ?? "";
        return {
          content: formatToolResult(
            "Growth recommendations",
            `${body || "No recommendations yet."}${tech ? `\n\nLearn next: ${tech}` : ""}`,
          ),
          toolUsed: "growth",
        };
      }
      case "trending": {
        if (!this.profileAnalysis) return { content: NEED_ANALYSIS_MESSAGE };
        onProgress?.("Searching trending repos in your domains…");
        const repos = await this.coaching.discoverTrending(
          this.profileAnalysis.profile,
          this.profileAnalysis.gapAnalysis,
        );
        if (this.profileAnalysis.actionPlan) {
          this.profileAnalysis.actionPlan.trendingRepos = repos;
        }
        return {
          content: formatToolResult(
            "Trending repos for your expertise",
            `${formatTrendingReposMarkdown(repos)}\n\nFork one with \`/fork owner/repo\` or \`fork reponame\` (uses GitHub MCP).`,
          ),
          toolUsed: "trending",
        };
      }
      case "fork": {
        return this.runForkCommand(args.join(" "), onProgress);
      }
      case "improve": {
        if (!this.profileAnalysis) return { content: NEED_ANALYSIS_MESSAGE };
        const items =
          this.profileAnalysis.actionPlan?.profileImprovements ??
          this.coaching.buildProfileImprovements(
            this.profileAnalysis.profile,
            this.profileAnalysis.gapAnalysis,
            this.sourceRepos(),
          );
        return {
          content: formatToolResult("Profile improvement plan", formatProfileImprovementsMarkdown(items)),
          toolUsed: "improve",
        };
      }
      case "export": {
        if (!this.profileAnalysis) return { content: NEED_ANALYSIS_MESSAGE };
        ensureDirs();
        const paths = saveProfileDossier(this.profileAnalysis, this.roleId);
        return {
          content: `Profile dossier exported to \`${paths.markdown}\` (JSON: \`${paths.json}\`)`,
          toolUsed: "export",
        };
      }
      case "rules": {
        const sub = args[0]?.toLowerCase();
        if (sub === "reload") {
          this.reloadAgentContext();
          return {
            content: formatToolResult(
              "Rules reloaded",
              `${this.agentBundle.rules.length} rule(s) loaded.\n\n${formatRulesList(this.agentBundle.rules)}`,
            ),
            toolUsed: "rules",
          };
        }
        if (sub === "off") {
          this.config.agent.rulesEnabled = false;
          saveConfig(this.config);
          return { content: "User rules disabled for LLM prompts. Run `/rules on` to re-enable.", toolUsed: "rules" };
        }
        if (sub === "on") {
          this.config.agent.rulesEnabled = true;
          saveConfig(this.config);
          return { content: "User rules enabled for LLM prompts.", toolUsed: "rules" };
        }
        return {
          content: formatToolResult(
            `Rules (${this.config.agent.rulesEnabled ? "enabled" : "disabled"})`,
            `${formatRulesList(this.agentBundle.rules)}\n\nAdd \`.md\` files to \`~/.config/git-mentor/rules/\` or \`.git-mentor/rules/\`. Commands: \`/rules reload\`, \`/rules on|off\`.`,
          ),
          toolUsed: "rules",
        };
      }
      case "skills": {
        const sub = args[0]?.toLowerCase();
        const skillId = args[1];

        if (sub === "use" && skillId) {
          if (!this.agentBundle.skills.some((skill) => skill.id === skillId)) {
            return { content: `Unknown skill \`${skillId}\`. Run \`/skills\` to list available skills.` };
          }
          if (!this.config.agent.activeSkills.includes(skillId)) {
            this.config.agent.activeSkills.push(skillId);
            saveConfig(this.config);
          }
          this.reloadAgentContext();
          return {
            content: formatToolResult(`Skill activated: ${skillId}`, formatSkillsList(this.agentBundle)),
            toolUsed: "skills",
          };
        }

        if (sub === "off" && skillId) {
          this.config.agent.activeSkills = this.config.agent.activeSkills.filter((id) => id !== skillId);
          saveConfig(this.config);
          this.reloadAgentContext();
          return {
            content: formatToolResult(`Skill deactivated: ${skillId}`, formatSkillsList(this.agentBundle)),
            toolUsed: "skills",
          };
        }

        if (sub === "reload") {
          this.reloadAgentContext();
          return {
            content: formatToolResult("Skills reloaded", formatSkillsList(this.agentBundle)),
            toolUsed: "skills",
          };
        }

        return {
          content: formatToolResult(
            `Skills (${this.config.agent.skillsEnabled ? "enabled" : "disabled"})`,
            `${formatSkillsList(this.agentBundle)}\n\nCommands: \`/skills use <id>\`, \`/skills off <id>\`, \`/skills reload\`.`,
          ),
          toolUsed: "skills",
        };
      }
      case "mcp": {
        const sub = args[0]?.toLowerCase();
        if (!sub || sub === "list") {
          return { content: formatMcpServersList(this.config), toolUsed: "mcp" };
        }
        if (sub === "tools" && args[1]) {
          try {
            onProgress?.(`Listing tools for MCP server ${args[1]}…`);
            const tools = await listExternalMcpTools(this.config, args[1]!);
            const body = tools.map((tool) => `- \`${tool.name}\`${tool.description ? ` — ${tool.description}` : ""}`).join("\n");
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
              return { content: "Invalid JSON arguments. Example: `/mcp call github search_repositories {\"query\":\"mcp\"}`" };
            }
          }
          try {
            onProgress?.(`Calling ${args[1]}.${args[2]}…`);
            const result = await callExternalMcpTool(this.config, args[1]!, args[2]!, parsed);
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
            "Run `gitmentor mcp` to expose git-mentor tools to Cursor.",
          ].join("\n"),
          toolUsed: "mcp",
        };
      }
      case "help":
        return {
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
            "- /fork <repo> — fork via GitHub MCP (after /trending or owner/repo)",
            "- /improve — GitHub profile improvement plan",
            "- /export — save Markdown dossier",
            "- /rules — list coaching rules · /rules reload · /rules on|off",
            "- /skills — list skills · /skills use <id> · /skills off <id>",
            "- /mcp — MCP servers and external tool bridge",
            "- /help · /quit",
            "",
            "Free-form chat works once your profile is loaded (automatic with `gh auth`).",
          ].join("\n"),
        };
      case "quit":
      case "exit":
        return { content: "__EXIT__" };
      default:
        return { content: `Unknown command /${cmd}. Type /help.` };
    }
  }
}
