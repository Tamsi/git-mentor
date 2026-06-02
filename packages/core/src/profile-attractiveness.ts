import type { GitHubProfileData } from "./schemas.js";

export interface ProfileAttractiveness {
  score: number;
  bioPresent: boolean;
  bioLength: number;
  profileReadmePresent: boolean;
  profileReadmePreview?: string;
  pinnedCount: number;
  reposWithDescription: number;
  followers: number;
  following: number;
  totalStars: number;
  publicRepos: number;
  recentActivityCount: number;
  highlights: string[];
  improvements: string[];
}

function clampScore(value: number): number {
  return Math.round(Math.min(10, Math.max(0, value)) * 10) / 10;
}

export function analyzeProfileAttractiveness(data: GitHubProfileData): ProfileAttractiveness {
  const { user, repos } = data;
  const bio = user.bio?.trim() ?? "";
  const profileReadme = data.profileReadme?.trim() ?? "";
  const pinned = data.pinnedRepos ?? [];
  const activity = data.recentActivity ?? [];
  const reposWithDescription = repos.filter((repo) => repo.description?.trim()).length;
  const totalStars = repos.reduce((sum, repo) => sum + (repo.stargazers_count ?? 0), 0);
  const followers = user.followers ?? 0;
  const following = user.following ?? 0;
  const publicRepos = user.public_repos ?? repos.length;

  let score = 3;
  const highlights: string[] = [];
  const improvements: string[] = [];

  if (bio.length >= 40) {
    score += 1.2;
    highlights.push("Professional bio present");
  } else if (bio.length > 0) {
    score += 0.4;
    improvements.push("Expand your bio with role, stack, and what you ship");
  } else {
    improvements.push("Add a GitHub bio — it's the first line recruiters read");
  }

  if (profileReadme.length > 80) {
    score += 1.5;
    highlights.push("Profile README detected");
  } else {
    improvements.push("Add a profile README (`username/username` repo) to tell your story");
  }

  if (pinned.length >= 3) {
    score += 1.2;
    highlights.push(`${pinned.length} pinned repositories showcase your work`);
  } else if (pinned.length > 0) {
    score += 0.5;
    improvements.push("Pin 3–6 repos that best match your target role");
  } else {
    improvements.push("Pin your strongest repos — they appear above the fold");
  }

  if (publicRepos >= 8) score += 0.8;
  else if (publicRepos >= 3) score += 0.3;
  else improvements.push("Grow your public portfolio with 2–3 flagship projects");

  if (totalStars >= 50) {
    score += 1;
    highlights.push(`${totalStars} total stars across public repos`);
  } else if (totalStars >= 10) {
    score += 0.5;
  }

  if (reposWithDescription >= Math.min(repos.length, 5)) score += 0.5;
  else improvements.push("Add descriptions and topics to top repositories");

  if (activity.length >= 8) {
    score += 0.8;
    highlights.push("Recent public GitHub activity");
  } else if (activity.length >= 3) {
    score += 0.3;
  } else {
    improvements.push("Increase visible activity: commits, PRs, or OSS contributions");
  }

  if (followers >= 20) {
    score += 0.4;
    highlights.push(`${followers} followers`);
  }

  if (user.company?.trim()) highlights.push(`Company listed: ${user.company.trim()}`);
  if (user.location?.trim()) highlights.push(`Location: ${user.location.trim()}`);

  return {
    score: clampScore(score),
    bioPresent: bio.length > 0,
    bioLength: bio.length,
    profileReadmePresent: profileReadme.length > 0,
    profileReadmePreview: profileReadme.slice(0, 400) || undefined,
    pinnedCount: pinned.length,
    reposWithDescription,
    followers,
    following,
    totalStars,
    publicRepos,
    recentActivityCount: activity.length,
    highlights: highlights.slice(0, 6),
    improvements: improvements.slice(0, 6),
  };
}

export function formatAttractivenessMarkdown(attractiveness: ProfileAttractiveness): string {
  const lines = [
    "## Profile attractiveness",
    "",
    `**Score:** ${attractiveness.score}/10`,
    "",
    "### Highlights",
    ...(attractiveness.highlights.length
      ? attractiveness.highlights.map((item) => `- ${item}`)
      : ["- _No major highlights detected yet_"]),
    "",
    "### Improvements",
    ...(attractiveness.improvements.length
      ? attractiveness.improvements.map((item) => `- ${item}`)
      : ["- _Profile presentation looks solid — focus on role-specific gaps_"]),
    "",
    "### GitHub stats",
    `- Public repos: ${attractiveness.publicRepos}`,
    `- Total stars (sampled): ${attractiveness.totalStars}`,
    `- Followers / following: ${attractiveness.followers} / ${attractiveness.following}`,
    `- Repos with descriptions: ${attractiveness.reposWithDescription}`,
    `- Pinned repos: ${attractiveness.pinnedCount}`,
    `- Profile README: ${attractiveness.profileReadmePresent ? "yes" : "no"}`,
    `- Recent activity events: ${attractiveness.recentActivityCount}`,
  ];

  if (attractiveness.profileReadmePreview) {
    lines.push("", "### Profile README (preview)", "", attractiveness.profileReadmePreview);
  }

  return lines.join("\n");
}
