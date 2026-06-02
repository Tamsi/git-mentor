import {
  ActionPlanSchema,
  AnalysisResultSchema,
  type AnalysisResult,
  type GitHubProfileData,
  type GitHubRepoData,
} from "./schemas.js";

function migrateActionPlan(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const plan = raw as Record<string, unknown>;
  if (plan.github && typeof plan.github === "object") return raw;

  return {
    ...plan,
    github: {
      repos: plan.trendingRepos ?? [],
      profiles: plan.profilesToFollow ?? [],
    },
  };
}

function migrateGithubData(result: AnalysisResult): GitHubProfileData | undefined {
  if (result.githubData) return result.githubData;

  const signals = result.signals as Record<string, unknown>;
  const repos = signals._repos;
  if (!Array.isArray(repos) || repos.length === 0) return undefined;

  return {
    user: { login: result.profile.username },
    repos: repos as GitHubRepoData[],
  };
}

function stripLegacySignals(signals: Record<string, unknown>): Record<string, unknown> {
  if (!("_repos" in signals)) return signals;
  const { _repos: _ignored, ...rest } = signals;
  return rest;
}

export function normalizeAnalysisResult(raw: AnalysisResult): AnalysisResult {
  const githubData = migrateGithubData(raw);
  const actionPlan = raw.actionPlan
    ? ActionPlanSchema.parse(migrateActionPlan(raw.actionPlan))
    : undefined;

  const normalized: AnalysisResult = {
    ...raw,
    actionPlan,
    githubData,
    signals: stripLegacySignals(raw.signals as Record<string, unknown>),
  };

  return AnalysisResultSchema.parse(normalized);
}

export function getGithubProfileData(result: AnalysisResult): GitHubProfileData | undefined {
  return migrateGithubData(result);
}
