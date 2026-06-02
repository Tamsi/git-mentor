import fs from "node:fs";
import path from "node:path";
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
  listRoles,
  renderMarkdown,
  REPORTS_DIR,
  ensureDirs,
  saveConfig,
} from "@git-mentor/core";
import { LLMRouter, handleModelCommand, type ChatMessage, type LlmUsage, ensureOllamaModel, fetchOllamaContextLimit } from "@git-mentor/llm";
import {
  buildDeterministicOpening,
  buildSystemPrompt,
  buildWelcomeMessage,
  formatToolResult,
  messagesForChat,
  NEED_ANALYSIS_MESSAGE,
  OPENING_USER_PROMPT,
} from "./prompts.js";
import { buildContextSnapshot, type ContextSnapshot } from "./context-stats.js";

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
  "- `/analyze profile` — career profile from public GitHub metadata (languages, topics, activity). **No code/manifest scan.**",
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

  constructor(
    private config: GitMentorConfig,
    private username: string,
    roleId?: string,
  ) {
    this.pipeline = new AnalysisPipeline(config);
    this.coaching = new CoachingService(config);
    this.router = new LLMRouter(config);
    this.roleId = roleId ?? config.defaultRole;
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

  async bootstrap(): Promise<ChatReply> {
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

    if (!this.profileAnalysis) {
      return { content: NEED_ANALYSIS_MESSAGE };
    }

    const systemPrompt = buildSystemPrompt(
      this.profileAnalysis,
      this.roleId,
      [...this.repoAnalyses.values()],
    );
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

    if (!this.profileAnalysis) {
      yield { type: "token", content: NEED_ANALYSIS_MESSAGE };
      yield { type: "done", content: NEED_ANALYSIS_MESSAGE };
      return;
    }

    const systemPrompt = buildSystemPrompt(
      this.profileAnalysis,
      this.roleId,
      [...this.repoAnalyses.values()],
    );
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

    this.profileAnalysis = await this.pipeline.runProfile({
      username: this.username,
      roleId: this.roleId,
      onProgress,
    });
    this.resetSessionUsage();

    onProgress?.("Building coaching brief…");

    if (this.config.llm.provider === "deterministic") {
      return buildDeterministicOpening(this.profileAnalysis, this.roleId);
    }

    const systemPrompt = buildSystemPrompt(
      this.profileAnalysis,
      this.roleId,
      [...this.repoAnalyses.values()],
    );

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
          ? "Target role updated. Run **`/analyze profile`** to refresh gap analysis."
          : "Target role updated. Run **`/analyze profile`** to load your GitHub profile.";
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
          content: formatToolResult("Trending repos for your expertise", formatTrendingReposMarkdown(repos)),
          toolUsed: "trending",
        };
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
        const file = path.join(REPORTS_DIR, `${this.profileAnalysis.profile.username}.md`);
        fs.writeFileSync(file, renderMarkdown(this.profileAnalysis));
        return { content: `Dossier exported to \`${file}\``, toolUsed: "export" };
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
            "- /improve — GitHub profile improvement plan",
            "- /export — save Markdown dossier",
            "- /help · /quit",
            "",
            "Free-form chat works after **`/analyze profile`**.",
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
