import type {
  DeveloperProfile,
  GapAnalysis,
  GitHubProfileData,
  ProfileImprovement,
} from "@git-mentor/core";

export function buildProfileImprovements(
  profile: DeveloperProfile,
  gapAnalysis?: GapAnalysis,
  githubData?: GitHubProfileData,
): ProfileImprovement[] {
  const items: ProfileImprovement[] = [];
  const repos = githubData?.repos ?? [];

  if (!profile.bio?.trim()) {
    items.push({
      category: "bio",
      priority: 5,
      title: "Add a professional GitHub bio",
      description: "Your profile has no bio. Recruiters and maintainers use it as a first impression.",
      action: `Write 2–3 lines: primary stack (${profile.primaryStack.slice(0, 3).join(", ") || "your stack"}), focus area, and what you're building.`,
    });
  }

  const reposMissingDescription = repos.filter((r) => !r.description?.trim()).length;
  if (reposMissingDescription >= 2) {
    items.push({
      category: "readme",
      priority: 4,
      title: "Add descriptions to top repositories",
      description: `${reposMissingDescription} public repos lack a description — they won't surface well in search.`,
      action: "Add one-line descriptions and topics to your 3 most active repos.",
    });
  }

  const topRepos = [...repos].sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0));
  if (topRepos.length >= 2) {
    items.push({
      category: "pinned",
      priority: 4,
      title: "Pin your strongest repositories",
      description: "Pinned repos are the portfolio above the fold on your GitHub profile.",
      action: `Pin **${topRepos.slice(0, 3).map((r) => r.name).join("**, **")}** — your highest-signal public work.`,
    });
  }

  if (profile.repoCount < 5) {
    items.push({
      category: "portfolio",
      priority: 4,
      title: "Grow your public portfolio",
      description: "A thin public footprint limits evidence-backed skill claims.",
      action: "Ship 1–2 small OSS utilities or course projects in your primary stack this quarter.",
    });
  }

  if (profile.totalStars < 15 && profile.repoCount >= 3) {
    items.push({
      category: "activity",
      priority: 3,
      title: "Improve project discoverability",
      description: "Low star count despite multiple repos often means missing README depth or topics.",
      action: "Add README badges, architecture diagrams, and GitHub topics matching your stack.",
    });
  }

  for (const weakness of profile.weaknesses) {
    const lower = weakness.toLowerCase();
    if (lower.includes("open source")) {
      items.push({
        category: "oss",
        priority: 5,
        title: "Increase open-source contributions",
        description: "OSS activity is a weakness on your current profile.",
        action: "Contribute 1 PR/month to a trending repo in your stack — use `/trending` to find targets.",
      });
    }
    if (lower.includes("technical writing")) {
      items.push({
        category: "readme",
        priority: 4,
        title: "Publish technical writing",
        description: "Writing signals seniority and helps others evaluate your work.",
        action: "Add ADRs or deep README sections to a flagship repo; cross-post a short dev article.",
      });
    }
  }

  for (const gap of gapAnalysis?.gaps.slice(0, 3) ?? []) {
    items.push({
      category: "skills",
      priority: gap.priority,
      title: `Demonstrate ${gap.area}`,
      description: gap.rationale,
      action: `Build or contribute to a public project that showcases ${gap.area} — link it from your profile README.`,
    });
  }

  if (profile.domains.length > 0 && profile.skills.length >= 3) {
    items.push({
      category: "portfolio",
      priority: 3,
      title: "Align README narrative with your domain",
      description: `Your profile signals **${profile.domains[0]?.name}** — make that story explicit on GitHub.`,
      action: "Create a profile README or flagship repo README listing stack, domains, and 2–3 case studies.",
    });
  }

  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = item.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 8);
}

export function formatTrendingReposMarkdown(
  repos: Array<{ fullName: string; stars: number; relevanceReason: string; url: string; description?: string }>,
): string {
  if (repos.length === 0) return "_No trending repositories found for your domains._";
  return repos
    .map(
      (r) =>
        `- **${r.fullName}** (${r.stars.toLocaleString()}★) — ${r.relevanceReason}\n  ${r.description ?? ""}\n  ${r.url}`,
    )
    .join("\n\n");
}

export function formatProfileImprovementsMarkdown(
  items: ProfileImprovement[],
): string {
  if (items.length === 0) return "_No profile improvements identified._";
  return items
    .map(
      (item) =>
        `- **[${item.category}] ${item.title}** (priority ${item.priority}/5)\n  ${item.description}\n  → ${item.action}`,
    )
    .join("\n\n");
}
