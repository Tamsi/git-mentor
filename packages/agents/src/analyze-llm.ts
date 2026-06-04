import type { AnalysisResult, RepoAnalysisResult } from "@git-mentor/core";
import type { GitHubRepoData } from "@git-mentor/core";
import { LLMRouter } from "@git-mentor/llm";
import { buildProfileFacts, openingContradictsFacts, type ProfileFacts } from "./profile-facts.js";
import { buildRepoEvidence, type RepoEvidence } from "./repo-evidence.js";

export const PROFILE_ANALYZE_SYSTEM = [
  "You are git-mentor's profile analyze agent.",
  "You write evidence-backed GitHub career coaching from a FACTS JSON block only.",
  "",
  "Hard rules:",
  "- publicRepoCount and pinnedCount are different — never say the user has pinned repos when pinnedCount is 0.",
  "- When pinnedCount is 0, recommend pinning specific repos from topRepos.",
  "- Cite at least one repo fullName from topRepos when discussing portfolio.",
  "- Use fitScore and gaps from FACTS; do not invent skills or scores.",
  "- Be warm, specific, 4–6 sentences for the opening message.",
].join("\n");

export const REPO_ANALYZE_SYSTEM = [
  "You are git-mentor's repository analyze agent.",
  "You interpret ONE repository from structured EVIDENCE JSON only — no invented files or stats.",
  "",
  "Output markdown with these sections:",
  "## Overview",
  "## Stack & architecture",
  "## Maturity signals",
  "## Career relevance",
  "## Recommended next steps",
  "",
  "Keep under 400 words. Reference manifest and stackSignals from evidence.",
].join("\n");

export function buildProfileAnalyzeUserPrompt(facts: ProfileFacts): string {
  return [
    "Write the opening coach message for this developer (4–6 sentences).",
    "Include: greeting, 2 presentation highlights, biggest gap, one high-impact action with repo names if relevant.",
    "",
    "=== FACTS (source of truth) ===",
    JSON.stringify(facts, null, 2),
    "=== END FACTS ===",
  ].join("\n");
}

export function buildRepoAnalyzeUserPrompt(evidence: RepoEvidence, roleId: string): string {
  return [
    `Target career role id: ${roleId}`,
    "",
    "=== EVIDENCE ===",
    JSON.stringify(evidence, null, 2),
    "=== END EVIDENCE ===",
  ].join("\n");
}

export async function runProfileCoachLLM(
  router: LLMRouter,
  result: AnalysisResult,
  roleId: string,
  fallbackOpening: string,
): Promise<{ opening: string; executiveSummary: string | null }> {
  const facts = buildProfileFacts(result, roleId);
  const prompt = buildProfileAnalyzeUserPrompt(facts);

  try {
    const llm = await router.complete(prompt, PROFILE_ANALYZE_SYSTEM);
    const opening = llm.content.trim();
    if (!opening || llm.provider === "deterministic" || openingContradictsFacts(opening, facts)) {
      return { opening: fallbackOpening, executiveSummary: null };
    }
    if (result.profile.summary !== opening) {
      result.profile.summary = opening;
    }
    return { opening, executiveSummary: opening };
  } catch {
    return { opening: fallbackOpening, executiveSummary: null };
  }
}

export async function runRepoCoachLLM(
  router: LLMRouter,
  owner: string,
  repoData: GitHubRepoData,
  scan: RepoAnalysisResult,
  roleId: string,
  fallbackMarkdown: string,
): Promise<string> {
  const evidence = buildRepoEvidence(owner, repoData, scan);
  const prompt = buildRepoAnalyzeUserPrompt(evidence, roleId);

  try {
    const llm = await router.complete(prompt, REPO_ANALYZE_SYSTEM);
    const body = llm.content.trim();
    if (!body || llm.provider === "deterministic") {
      return fallbackMarkdown;
    }
    const header = `**Repository analysis — ${scan.fullName}**`;
    const link = scan.url ? `\n\n${scan.url}` : "";
    return `${header}\n\n${body}${link}`;
  } catch {
    return fallbackMarkdown;
  }
}
