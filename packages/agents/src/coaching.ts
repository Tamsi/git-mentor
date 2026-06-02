import type {
  AnalysisResult,
  DeveloperProfile,
  GapAnalysis,
  GitHubProfileData,
  GitMentorConfig,
  ProfileImprovement,
  TrendingRepo,
} from "@git-mentor/core";
import { GitHubClient, GitHubRepoDiscovery } from "@git-mentor/github";
import {
  buildProfileImprovements,
  formatProfileImprovementsMarkdown,
  formatTrendingReposMarkdown,
} from "./profile-improvement.js";

export class CoachingService {
  private discovery: GitHubRepoDiscovery;

  constructor(config: GitMentorConfig) {
    this.discovery = new GitHubRepoDiscovery(new GitHubClient(config));
  }

  async discoverTrending(
    profile: DeveloperProfile,
    gapAnalysis?: GapAnalysis,
    limit = 8,
  ): Promise<TrendingRepo[]> {
    return this.discovery.discoverTrending(profile, gapAnalysis, limit);
  }

  buildProfileImprovements(
    profile: DeveloperProfile,
    gapAnalysis?: GapAnalysis,
    githubData?: GitHubProfileData,
  ): ProfileImprovement[] {
    return buildProfileImprovements(profile, gapAnalysis, githubData);
  }

  async enrichActionPlan(
    result: AnalysisResult,
    githubData?: GitHubProfileData,
  ): Promise<AnalysisResult> {
    if (!result.actionPlan) return result;

    const trendingRepos = await this.discoverTrending(result.profile, result.gapAnalysis, 6);
    const profileImprovements = this.buildProfileImprovements(
      result.profile,
      result.gapAnalysis,
      githubData,
    );

    return {
      ...result,
      actionPlan: {
        ...result.actionPlan,
        trendingRepos,
        profileImprovements,
        reposToWatch: [
          ...trendingRepos.map((r) => r.fullName),
          ...result.actionPlan.reposToWatch,
        ].slice(0, 8),
      },
    };
  }

  formatTrendingMarkdown(repos: TrendingRepo[]): string {
    return formatTrendingReposMarkdown(repos);
  }

  formatImprovementsMarkdown(items: ProfileImprovement[]): string {
    return formatProfileImprovementsMarkdown(items);
  }
}

export {
  buildProfileImprovements,
  formatProfileImprovementsMarkdown,
  formatTrendingReposMarkdown,
} from "./profile-improvement.js";
