import type { AnalysisResult, ProfileImprovement } from "@git-mentor/core";
import { LLMRouter } from "@git-mentor/llm";
import { buildProfileFacts, openingContradictsFacts, type ProfileFacts } from "./profile-facts.js";

export const GROWTH_COACH_SYSTEM = [
  "You are git-mentor's growth planning agent.",
  "Write a personalized 2–4 week GitHub career growth plan from FACTS JSON only.",
  "",
  "Output markdown:",
  "- One short intro paragraph (max 2 sentences)",
  "- **This week** — 1–2 concrete actions with effort [S/M/L]",
  "- **Next 2–4 weeks** — 2–3 actions tied to gaps and topRepos",
  "- **Technologies to explore** — bullet list from facts",
  "",
  "Hard rules:",
  "- Never use vague phrases like 'create a recurring habit' without a specific deliverable.",
  "- Each action must cite a repo fullName from topRepos or name a gap from facts.",
  "- publicRepoCount ≠ pinnedCount — if pinnedCount is 0, recommend pinning topRepos.",
  "- Do not invent employers, credentials, or repos not in FACTS.",
  "- Max 350 words.",
].join("\n");

export const IMPROVE_COACH_SYSTEM = [
  "You are git-mentor's profile improvement agent.",
  "Prioritize and rewrite profile improvements from FACTS + ruleBasedImprovements JSON.",
  "",
  "Output markdown: 4–6 bullet items, each with:",
  "- **Title** (priority N/5)",
  "- Why it matters (one line, evidence-backed)",
  "- → Concrete action (mention /apply or a repo fullName when relevant)",
  "",
  "Hard rules:",
  "- Order by impact for the target role.",
  "- Prefer topRepos for pin suggestions — never suggest bootcamp/school repos (piscine, 42, tutorial).",
  "- If pinnedCount is 0, top priority is pinning flagship MCP/AI repos from topRepos.",
  "- Skip 'add descriptions' if most repos already have descriptions (see ruleBasedImprovements).",
  "- Do not claim pins exist when pinnedCount is 0.",
  "- Max 400 words.",
].join("\n");

export interface GrowthCoachPayload extends ProfileFacts {
  recommendations: Array<{ title: string; effort: string; description: string; category: string }>;
  technologiesToLearn: string[];
  ossOpportunities: string[];
  learningPlan: Array<{ title: string; description: string; effort: string }>;
}

export interface ImproveCoachPayload extends ProfileFacts {
  ruleBasedImprovements: Array<{
    category: string;
    priority: number;
    title: string;
    description: string;
    action: string;
  }>;
}

export function buildGrowthCoachPayload(result: AnalysisResult, roleId: string): GrowthCoachPayload {
  const plan = result.actionPlan;
  return {
    ...buildProfileFacts(result, roleId),
    recommendations: (plan?.recommendations ?? []).slice(0, 8).map((r) => ({
      title: r.title,
      effort: r.effort,
      description: r.description,
      category: r.category,
    })),
    technologiesToLearn: plan?.technologiesToLearn ?? [],
    ossOpportunities: plan?.ossOpportunities ?? [],
    learningPlan: (result.gapAnalysis?.learningPlan ?? []).slice(0, 6).map((item) => ({
      title: item.title,
      description: item.description,
      effort: item.effort,
    })),
  };
}

export function buildImproveCoachPayload(
  result: AnalysisResult,
  roleId: string,
  items: ProfileImprovement[],
): ImproveCoachPayload {
  return {
    ...buildProfileFacts(result, roleId),
    ruleBasedImprovements: items.map((item) => ({
      category: item.category,
      priority: item.priority,
      title: item.title,
      description: item.description,
      action: item.action,
    })),
  };
}

function isLowQualityGrowth(text: string): boolean {
  const lower = text.toLowerCase();
  if (/recurring habit/i.test(lower)) return true;
  if (text.trim().length < 120) return true;
  return false;
}

function suggestsBootcampPin(text: string): boolean {
  return /\bpiscine|42-school|galaxy-shooter\b/i.test(text);
}

export async function runGrowthCoachLLM(
  router: LLMRouter,
  result: AnalysisResult,
  roleId: string,
  fallbackMarkdown: string,
): Promise<string> {
  const payload = buildGrowthCoachPayload(result, roleId);
  const prompt = [
    "Write the growth plan markdown for this developer.",
    "",
    "=== FACTS ===",
    JSON.stringify(payload, null, 2),
    "=== END FACTS ===",
  ].join("\n");

  try {
    const llm = await router.complete(prompt, GROWTH_COACH_SYSTEM);
    const body = llm.content.trim();
    if (!body || llm.provider === "deterministic" || isLowQualityGrowth(body)) {
      return fallbackMarkdown;
    }
    if (openingContradictsFacts(body, payload)) {
      return fallbackMarkdown;
    }
    return body;
  } catch {
    return fallbackMarkdown;
  }
}

export async function runImproveCoachLLM(
  router: LLMRouter,
  result: AnalysisResult,
  roleId: string,
  items: ProfileImprovement[],
  fallbackMarkdown: string,
): Promise<string> {
  const payload = buildImproveCoachPayload(result, roleId, items);
  const prompt = [
    "Write the prioritized profile improvement plan markdown.",
    "",
    "=== FACTS ===",
    JSON.stringify(payload, null, 2),
    "=== END FACTS ===",
  ].join("\n");

  try {
    const llm = await router.complete(prompt, IMPROVE_COACH_SYSTEM);
    const body = llm.content.trim();
    if (!body || llm.provider === "deterministic" || suggestsBootcampPin(body)) {
      return fallbackMarkdown;
    }
    if (openingContradictsFacts(body, payload)) {
      return fallbackMarkdown;
    }
    return body;
  } catch {
    return fallbackMarkdown;
  }
}
