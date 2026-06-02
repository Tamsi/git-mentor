import type { AnalysisResult, RepoAnalysisResult } from "@git-mentor/core";
import {
  type ChatMessage,
  type LlmUsage,
  estimateMessagesTokens,
  estimateTokens,
  formatTokenCount,
} from "@git-mentor/llm";
import { buildSystemPrompt } from "./prompts.js";

export interface ContextSnapshot {
  profileLoaded: boolean;
  repoCount: number;
  historyMessages: number;
  chatTurns: number;
  systemPromptTokens: number;
  contextUsed: number;
  contextLimit: number;
  contextPercent: number;
  lastPromptTokens: number | null;
  lastCompletionTokens: number | null;
  sessionPromptTokens: number;
  sessionCompletionTokens: number;
  usageSource: "provider" | "estimated" | "none";
}

const DEFAULT_CONTEXT_LIMIT = 128_000;

export function buildContextSnapshot(options: {
  profileAnalysis: AnalysisResult | null;
  roleId: string;
  repoAnalyses: RepoAnalysisResult[];
  history: ChatMessage[];
  contextLimit?: number;
  lastUsage?: LlmUsage;
  sessionPromptTokens: number;
  sessionCompletionTokens: number;
  agentContextSection?: string;
}): ContextSnapshot {
  const systemPrompt = options.profileAnalysis
    ? buildSystemPrompt(
        options.profileAnalysis,
        options.roleId,
        options.repoAnalyses,
        options.agentContextSection ?? "",
      )
    : "";
  const systemPromptTokens = estimateTokens(systemPrompt);
  const historyTokens = estimateMessagesTokens(options.history);
  const estimatedContext = systemPromptTokens + historyTokens;

  const contextLimit = options.contextLimit ?? DEFAULT_CONTEXT_LIMIT;
  const contextUsed = options.lastUsage?.promptTokens ?? estimatedContext;
  const contextPercent = contextLimit > 0 ? Math.min(100, (contextUsed / contextLimit) * 100) : 0;
  const chatTurns = Math.floor(options.history.filter((m) => m.role === "user").length);

  return {
    profileLoaded: Boolean(options.profileAnalysis),
    repoCount: options.repoAnalyses.length,
    historyMessages: options.history.length,
    chatTurns,
    systemPromptTokens,
    contextUsed,
    contextLimit,
    contextPercent,
    lastPromptTokens: options.lastUsage?.promptTokens ?? null,
    lastCompletionTokens: options.lastUsage?.completionTokens ?? null,
    sessionPromptTokens: options.sessionPromptTokens,
    sessionCompletionTokens: options.sessionCompletionTokens,
    usageSource: options.lastUsage?.source ?? (options.profileAnalysis ? "estimated" : "none"),
  };
}

export function formatContextBar(snapshot: ContextSnapshot): string {
  if (!snapshot.profileLoaded) {
    return `context — / ${formatTokenCount(snapshot.contextLimit)} · profile not loaded · run /analyze profile`;
  }

  const bar = renderContextMeter(snapshot.contextPercent);
  const lastTurn =
    snapshot.lastPromptTokens != null
      ? ` · last +${formatTokenCount(snapshot.lastPromptTokens)} in / +${formatTokenCount(snapshot.lastCompletionTokens ?? 0)} out`
      : ` · ~${formatTokenCount(snapshot.contextUsed)} est.`;
  const session = ` · session ${formatTokenCount(snapshot.sessionPromptTokens)} in / ${formatTokenCount(snapshot.sessionCompletionTokens)} out`;
  const meta = ` · ${snapshot.chatTurns} turn${snapshot.chatTurns === 1 ? "" : "s"} · sys ${formatTokenCount(snapshot.systemPromptTokens)}${snapshot.repoCount > 0 ? ` · ${snapshot.repoCount} repo${snapshot.repoCount > 1 ? "s" : ""}` : ""}`;

  return `context ${formatTokenCount(snapshot.contextUsed)} / ${formatTokenCount(snapshot.contextLimit)} (${Math.round(snapshot.contextPercent)}%) ${bar}${lastTurn}${session}${meta}`;
}

function renderContextMeter(percent: number): string {
  const width = 10;
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
}
