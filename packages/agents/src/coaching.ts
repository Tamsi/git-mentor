import type {
  AnalysisResult,
  DeveloperProfile,
  GapAnalysis,
  GitHubProfileData,
  GitMentorConfig,
  ProfileImprovement,
  ProfileToFollow,
  TrendingRepo,
} from "@git-mentor/core";
import { GitHubClient, GitHubProfileDiscovery, GitHubRepoDiscovery } from "@git-mentor/github";
import {
  buildProfileImprovements,
  formatProfileImprovementsMarkdown,
  formatTrendingReposMarkdown,
} from "./profile-improvement.js";

export { formatProfilesToFollowMarkdown } from "@git-mentor/github";

export class CoachingService {
  private discovery: GitHubRepoDiscovery;
  private profileDiscovery: GitHubProfileDiscovery;

  constructor(config: GitMentorConfig) {
    const client = new GitHubClient(config);
    this.discovery = new GitHubRepoDiscovery(client);
    this.profileDiscovery = new GitHubProfileDiscovery(client);
  }

  async discoverTrending(
    profile: DeveloperProfile,
    gapAnalysis?: GapAnalysis,
    limit = 8,
  ): Promise<TrendingRepo[]> {
    return this.discovery.discoverTrending(profile, gapAnalysis, limit);
  }

  async discoverProfilesToFollow(
    profile: DeveloperProfile,
    roleId: string,
    options?: {
      gapAnalysis?: GapAnalysis;
      trendingRepos?: TrendingRepo[];
      limit?: number;
    },
  ): Promise<ProfileToFollow[]> {
    return this.profileDiscovery.discoverProfilesToFollow(profile, roleId, options);
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
        github: {
          repos: trendingRepos,
          profiles: result.actionPlan.github.profiles,
        },
        profileImprovements,
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
