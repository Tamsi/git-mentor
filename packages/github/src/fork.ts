import type { TrendingRepo } from "@git-mentor/core";

export function resolveForkTarget(
  input: string,
  trendingRepos: TrendingRepo[] = [],
): { owner: string; repo: string } | null {
  let cleaned = input.trim();
  cleaned = cleaned
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/$/, "");

  if (cleaned.includes("/")) {
    const [owner, repo] = cleaned.split("/").filter(Boolean);
    if (owner && repo) return { owner, repo };
  }

  const needle = cleaned.toLowerCase();
  if (!needle) return null;

  for (const item of trendingRepos) {
    const [owner, repo] = item.fullName.split("/");
    if (!owner || !repo) continue;
    if (repo.toLowerCase() === needle || item.fullName.toLowerCase() === needle) {
      return { owner, repo };
    }
  }

  return null;
}

export function formatForkResult(options: {
  source: string;
  forkFullName: string;
  forkUrl: string;
  alreadyExisted: boolean;
}): string {
  const action = options.alreadyExisted ? "Already forked" : "Forked";
  return [
    `**${action}** \`${options.source}\` → [\`${options.forkFullName}\`](${options.forkUrl})`,
    "",
    "Next steps:",
    `- Clone: \`git clone ${options.forkUrl}.git\``,
    "- Pin it on your profile if it's portfolio-worthy",
    "- Run `/analyze " + options.forkFullName.split("/")[1] + "` for a stack deep-scan",
  ].join("\n");
}
