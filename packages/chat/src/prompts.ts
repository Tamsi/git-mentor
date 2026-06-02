import type { AnalysisResult, RepoAnalysisResult } from "@git-mentor/core";
import { listRoles } from "@git-mentor/core";
import type { ChatMessage } from "@git-mentor/llm";

function formatSkillEvidence(result: AnalysisResult): string {
  return result.profile.skills
    .slice(0, 12)
    .map((skill) => {
      const evidence = skill.evidence
        .slice(0, 2)
        .map((e) => e.title)
        .join("; ");
      return `- ${skill.name}: ${skill.level} (${skill.score}/10, ${skill.confidence} confidence)${evidence ? ` — ${evidence}` : ""}`;
    })
    .join("\n");
}

function formatTopRepos(result: AnalysisResult): string {
  const signalRepos = (result.signals as { repoEvidence?: Array<{ title: string; summary: string; url?: string }> })
    .repoEvidence;
  const evidence =
    signalRepos ??
    result.profile.skills.flatMap((s) => s.evidence).filter((e) => e.type === "repository");

  return evidence
    .slice(0, 8)
    .map((e) => `- ${e.title}: ${e.summary}${e.url ? ` (${e.url})` : ""}`)
    .join("\n");
}

function formatGaps(result: AnalysisResult): string {
  const gaps = result.gapAnalysis?.gaps ?? [];
  if (gaps.length === 0) return "No gap analysis computed.";
  return gaps
    .slice(0, 8)
    .map((g) => `- ${g.area} (${g.currentLevel} → ${g.targetLevel}, priority ${g.priority}): ${g.rationale}`)
    .join("\n");
}

function formatGrowthPlan(result: AnalysisResult): string {
  const plan = result.actionPlan;
  if (!plan) return "No growth plan computed.";
  const recs = plan.recommendations
    .slice(0, 5)
    .map((r) => `- [${r.effort}] ${r.title}: ${r.description}`)
    .join("\n");
  const tech = plan.technologiesToLearn.slice(0, 5).join(", ");
  const trending = plan.trendingRepos
    .slice(0, 5)
    .map((r) => `- ${r.fullName} (${r.stars}★): ${r.relevanceReason}`)
    .join("\n");
  return [
    recs,
    tech ? `Technologies to explore: ${tech}` : "",
    trending ? `Trending repos:\n${trending}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatProfileImprovements(result: AnalysisResult): string {
  const items = result.actionPlan?.profileImprovements ?? [];
  if (items.length === 0) return "Run /improve after /analyze for profile tips.";
  return items
    .slice(0, 6)
    .map((item) => `- [${item.category}] ${item.title}: ${item.action}`)
    .join("\n");
}

export function buildAnalysisContext(result: AnalysisResult, targetRole: string): string {
  const { profile } = result;
  const roles = listRoles().map((r) => `${r.id} (${r.name})`).join(", ");

  return [
    `GitHub user: @${profile.username}${profile.displayName ? ` (${profile.displayName})` : ""}`,
    profile.bio ? `Bio: ${profile.bio}` : "",
    `Target role: ${targetRole}`,
    `Repos analyzed: ${profile.repoCount} · Public: ${profile.publicRepos} · Stars: ${profile.totalStars}`,
    `Primary stack: ${profile.primaryStack.join(", ") || "unknown"}`,
    `Maturity score: ${profile.maturityScore}/10`,
    `Career fit for ${result.gapAnalysis?.targetRole ?? targetRole}: ${result.gapAnalysis?.fitScore ?? "N/A"}/10`,
    "",
    "Profile summary:",
    profile.summary,
    "",
    "Skills (evidence-backed):",
    formatSkillEvidence(result),
    "",
    "Top repository signals:",
    formatTopRepos(result) || "- No repository evidence extracted",
    "",
    "Strengths:",
    profile.strengths.map((s) => `- ${s}`).join("\n") || "- none listed",
    "",
    "Weaknesses:",
    profile.weaknesses.map((w) => `- ${w}`).join("\n") || "- none listed",
    "",
    "Gap analysis:",
    result.gapAnalysis?.summary ?? "Not computed",
    formatGaps(result),
    "",
    "Strengths for target role:",
    result.gapAnalysis?.strengthsForRole.map((s) => `- ${s}`).join("\n") || "- none",
    "",
    "Growth plan:",
    formatGrowthPlan(result),
    "",
    "Profile improvements:",
    formatProfileImprovements(result),
    "",
    `Available target roles: ${roles}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildSystemPrompt(
  result: AnalysisResult,
  targetRole: string,
  repoAnalyses: RepoAnalysisResult[] = [],
): string {
  const repoSection =
    repoAnalyses.length > 0
      ? [
          "",
          "=== REPOSITORY DEEP ANALYSES (manifests / stack) ===",
          ...repoAnalyses.map(
            (r) =>
              `- ${r.fullName}: ${r.summary}\n  Stack: ${r.stackSignals.join(", ") || "n/a"} · Manifests: ${r.manifests.join(", ") || "none"}`,
          ),
          "=== END REPO ANALYSES ===",
        ].join("\n")
      : "";

  return [
    "You are git-mentor, an evidence-backed GitHub career coach.",
    "You help developers understand their technical profile, career gaps, and growth opportunities.",
    "",
    "Rules:",
    "- Ground every claim in the profile data below. Never invent skills, scores, or repos.",
    "- Cite specific repos, languages, or dependencies when making claims.",
    "- Be concise, actionable, and honest. Use bullet points for lists of recommendations.",
    "- When suggesting next steps, tie them to gaps or weaknesses in the data.",
    "- If data is missing, say so and suggest /analyze or /role.",
    "- You can reference slash commands (/gaps, /growth, /export) when helpful.",
    "",
    "=== VERIFIED GITHUB PROFILE ===",
    buildAnalysisContext(result, targetRole),
    "=== END PROFILE ===",
    repoSection,
  ].join("\n");
}

export const OPENING_USER_PROMPT = [
  "You just finished analyzing this developer's public GitHub profile.",
  "Write a warm opening message (4–6 sentences) as their career coach:",
  "1) Greet them by username",
  "2) Highlight 2 concrete strengths with evidence from their repos/stack",
  "3) Name the biggest gap for their target role",
  "4) Suggest one high-impact next step from the growth plan",
  "5) Invite them to ask questions or run /gaps or /growth",
  "Do not repeat raw scores. Be specific and encouraging.",
].join("\n");

export function buildDeterministicOpening(result: AnalysisResult, targetRole: string): string {
  const { profile } = result;
  const topSkills = profile.skills.slice(0, 3).map((s) => s.name).join(", ");
  const topGap = result.gapAnalysis?.gaps[0]?.area ?? "role-specific skills";
  const firstRec = result.actionPlan?.recommendations[0]?.title ?? "explore /growth for a plan";

  return [
    `Hey @${profile.username}! I've analyzed your public GitHub profile.`,
    "",
    `Your stack (${profile.primaryStack.slice(0, 4).join(", ")}) and skills like **${topSkills}** stand out.`,
    `For **${targetRole}**, fit is **${result.gapAnalysis?.fitScore ?? "N/A"}/10** — biggest gap: **${topGap}**.`,
    "",
    `Suggested next step: **${firstRec}**.`,
    "",
    "Ask me anything about your profile, or try `/gaps`, `/growth`, `/export`.",
  ].join("\n");
}

export function buildWelcomeMessage(username: string, roleId: string): string {
  return [
    `Ready to coach **@${username}** toward **${roleId}**.`,
    "",
    "Start with **`/analyze profile`** (GitHub career profile — metadata only, no code scan).",
    "Deep-dive a repo with **`/analyze redbee-mcp`** (manifests & dependencies).",
    "",
    "Then: `/gaps`, `/growth`, `/trending`, `/improve`, or ask questions.",
    "Type **`/help`** for all commands.",
  ].join("\n");
}

export const WELCOME_MESSAGE = [
  "Welcome to git-mentor chat.",
  "Run /analyze profile for your GitHub career profile, or /analyze <repo> for a repository deep scan.",
  "",
  "Commands: /analyze profile · /analyze <repo> · /role · /model · /model signin · /gaps · /growth · /trending · /improve · /export · /help · /quit",
].join("\n");

export const NEED_ANALYSIS_MESSAGE =
  "No profile loaded yet. Run **`/analyze profile`** first, then ask your question.";

export function formatToolResult(label: string, body: string): string {
  return `**${label}**\n\n${body}`;
}

export function messagesForChat(systemPrompt: string, history: ChatMessage[], userInput: string): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt },
    ...history.filter((m) => m.role !== "system"),
    { role: "user", content: userInput },
  ];
}
