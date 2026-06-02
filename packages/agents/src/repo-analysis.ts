import type { GitHubRepoData, RepoAnalysisResult } from "@git-mentor/core";

const MANIFEST_NAMES = [
  "package.json",
  "composer.json",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
];

const DEPENDENCY_SIGNALS: Record<string, string[]> = {
  Symfony: ["symfony/", "symfony"],
  React: ["react", "react-dom"],
  LangGraph: ["langgraph"],
  FastAPI: ["fastapi"],
  Laravel: ["laravel/framework"],
  "Next.js": ["\"next\""],
  PyTorch: ["torch"],
  Transformers: ["transformers"],
  Ollama: ["ollama"],
  MCP: ["@modelcontextprotocol", "mcp"],
  TypeScript: ["typescript"],
};

function detectManifests(repo: GitHubRepoData): string[] {
  const found = new Set<string>();
  for (const marker of repo.dependency_markers ?? []) {
    for (const manifest of MANIFEST_NAMES) {
      if (marker.includes(`"${manifest.split(".")[0]}"`) || marker.includes(manifest)) {
        found.add(manifest);
      }
    }
  }
  if (found.size === 0 && (repo.dependency_markers?.length ?? 0) > 0) {
    return ["manifest detected"];
  }
  return [...found];
}

function detectStackSignals(repo: GitHubRepoData): string[] {
  const blob = (repo.dependency_markers ?? []).join(" ").toLowerCase();
  const hits: string[] = [];
  for (const [skill, markers] of Object.entries(DEPENDENCY_SIGNALS)) {
    if (markers.some((m) => blob.includes(m.toLowerCase()))) hits.push(skill);
  }
  if (repo.language && !hits.includes(repo.language)) {
    hits.unshift(repo.language);
  }
  return [...new Set(hits)];
}

export function analyzeRepository(owner: string, repo: GitHubRepoData): RepoAnalysisResult {
  const manifests = detectManifests(repo);
  const stackSignals = detectStackSignals(repo);
  const topicLine = (repo.topics ?? []).slice(0, 5).join(", ");

  const summary = [
    `Deep analysis of **${owner}/${repo.name}** (${repo.language ?? "unknown language"}, ${repo.stargazers_count ?? 0} stars).`,
    repo.description ? `Description: ${repo.description}` : "No repository description.",
    manifests.length ? `Manifests scanned: ${manifests.join(", ")}.` : "No dependency manifests found at repo root.",
    stackSignals.length ? `Stack signals: ${stackSignals.join(", ")}.` : "No dependency signals extracted.",
    topicLine ? `Topics: ${topicLine}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    owner,
    repoName: repo.name,
    fullName: `${owner}/${repo.name}`,
    url: repo.html_url,
    description: repo.description ?? undefined,
    language: repo.language ?? undefined,
    stars: repo.stargazers_count ?? 0,
    topics: repo.topics ?? [],
    manifests,
    stackSignals,
    summary,
    analyzedAt: new Date().toISOString(),
  };
}

export function formatRepoAnalysisMarkdown(result: RepoAnalysisResult): string {
  return [
    `**Repository analysis — ${result.fullName}**`,
    "",
    result.summary,
    "",
    result.manifests.length ? `**Manifests:** ${result.manifests.join(", ")}` : "",
    result.stackSignals.length ? `**Stack:** ${result.stackSignals.join(", ")}` : "",
    result.url ? `\n${result.url}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function parseRepoTarget(arg: string, defaultOwner: string): { owner: string; repo: string } {
  const cleaned = arg.replace(/^@/, "").trim();
  if (cleaned.includes("/")) {
    const [owner, repo] = cleaned.split("/");
    return { owner: owner!, repo: repo! };
  }
  return { owner: defaultOwner, repo: cleaned };
}
