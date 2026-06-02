import {
  AnalysisPipeline,
  CoachingService,
  formatRepoAnalysisMarkdown,
  parseRepoTarget,
} from "@git-mentor/agents";
import {
  type AnalysisResult,
  type GitMentorConfig,
  type RepoAnalysisResult,
  type AgentContextBundle,
  type TrendingRepo,
  formatAgentContextForPrompt,
  loadAgentContext,
  loadProfileDossier,
  profileDossierPaths,
  saveProfileDossier,
  saveConfig,
} from "@git-mentor/core";
import { hasGitHubAuth, ensureGitHubMcpServer } from "@git-mentor/github";
import {
  LLMRouter,
  type ChatMessage,
  type LlmUsage,
  ensureOllamaModel,
  fetchOllamaContextLimit,
} from "@git-mentor/llm";
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
  forkRepositoryViaGitHubMcp,
  formatGitHubMcpActionsHint,
  resolveForkTarget,
} from "./github-mcp.js";
import { dispatchCommand, type CommandContext } from "./commands.js";
import { routeInput } from "./input-router.js";
import { formatCommandError, formatGitHubError, isProfileAnalyzeTarget } from "./command-utils.js";
import type { ChatReply, ProgressCallback } from "./types.js";

export type { ContextSnapshot } from "./context-stats.js";
export { formatContextBar } from "./context-stats.js";
export type { ChatReply, ProgressCallback } from "./types.js";
export { formatCommandError, formatGitHubError, isProfileAnalyzeTarget } from "./command-utils.js";

export interface ChatSessionOptions {
  username: string;
  roleId: string;
  config: GitMentorConfig;
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

  private commandContext(): CommandContext {
    return {
      config: this.config,
      coaching: this.coaching,
      getUsername: () => this.username,
      setUsername: (username) => {
        this.username = username;
      },
      getRoleId: () => this.roleId,
      setRoleId: (roleId) => {
        this.roleId = roleId;
      },
      getProfileAnalysis: () => this.profileAnalysis,
      getAgentBundle: () => this.agentBundle,
      reloadAgentContext: () => this.reloadAgentContext(),
      pushHistory: (role, content) => this.history.push({ role, content }),
      refreshLlmClients: () => this.refreshLlmClients(),
      syncOllamaModel: (onProgress) => this.syncOllamaModel(onProgress),
      runProfileAnalysis: (onProgress) => this.runProfileAnalysis(onProgress),
      runRepoAnalysis: (repoArg, onProgress) => this.runRepoAnalysis(repoArg, onProgress),
      runForkCommand: (repoArg, onProgress) => this.runForkCommand(repoArg, onProgress),
      trendingReposForFork: () => this.trendingReposForFork(),
    };
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

  trendingReposForFork(): TrendingRepo[] {
    return this.profileAnalysis?.actionPlan?.github.repos ?? [];
  }

  async runForkCommand(repoArg: string, onProgress?: ProgressCallback): Promise<ChatReply> {
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
    const route = routeInput(trimmed, {
      hasProfile: Boolean(this.profileAnalysis),
      tryGitHubAction: (value) => this.tryGitHubActionInput(value, onProgress),
    });

    if (route.kind === "empty") return { content: "" };
    if (route.kind === "command") return dispatchCommand(this.commandContext(), route.command, onProgress);
    if (route.kind === "github-action") return route.run();
    if (route.kind === "need-analysis") return { content: NEED_ANALYSIS_MESSAGE };

    const systemPrompt = this.buildSessionSystemPrompt();
    const messages = messagesForChat(systemPrompt, this.history, route.message);
    await this.syncOllamaModel(onProgress);
    const reply = await this.router.chat(messages);
    this.recordUsage(reply.usage);

    this.history.push({ role: "user", content: route.message });
    this.history.push({ role: "assistant", content: reply.content });

    return { content: reply.content, analysis: this.profileAnalysis ?? undefined };
  }

  async *handleInputStream(
    input: string,
    onProgress?: ProgressCallback,
  ): AsyncGenerator<{ type: "token" | "done"; content: string; analysis?: AnalysisResult }> {
    const trimmed = input.trim();
    const route = routeInput(trimmed, {
      hasProfile: Boolean(this.profileAnalysis),
      tryGitHubAction: (value) => this.tryGitHubActionInput(value, onProgress),
    });

    if (route.kind === "empty") {
      yield { type: "done", content: "" };
      return;
    }

    if (route.kind === "command" || route.kind === "github-action") {
      const reply =
        route.kind === "command"
          ? await dispatchCommand(this.commandContext(), route.command, onProgress)
          : await route.run();
      yield { type: "token", content: reply.content };
      yield { type: "done", content: reply.content, analysis: reply.analysis };
      return;
    }

    if (route.kind === "need-analysis") {
      yield { type: "token", content: NEED_ANALYSIS_MESSAGE };
      yield { type: "done", content: NEED_ANALYSIS_MESSAGE };
      return;
    }

    const systemPrompt = this.buildSessionSystemPrompt();
    const messages = messagesForChat(systemPrompt, this.history, route.message);
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

    this.history.push({ role: "user", content: route.message });
    this.history.push({ role: "assistant", content: full });
    yield { type: "done", content: full, analysis: this.profileAnalysis ?? undefined };
  }

  async runProfileAnalysis(onProgress?: ProgressCallback): Promise<string> {
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

  async runRepoAnalysis(repoArg: string, onProgress?: ProgressCallback): Promise<ChatReply> {
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
}
