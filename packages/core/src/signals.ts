import type {
  Confidence,
  DeveloperProfile,
  DomainClaim,
  Evidence,
  GitHubProfileData,
  SkillClaim,
  SkillLevel,
} from "./schemas.js";

const LANGUAGE_ALIASES: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  php: "PHP",
  java: "Java",
  go: "Go",
  rust: "Rust",
  ruby: "Ruby",
  "c#": "C#",
  "c++": "C++",
  shell: "Shell",
  dockerfile: "Docker",
};

const DEPENDENCY_SIGNALS: Record<string, string[]> = {
  Symfony: ["symfony/", "symfony"],
  React: ["react", "react-dom", "@types/react"],
  LangGraph: ["langgraph"],
  FastAPI: ["fastapi"],
  Laravel: ["laravel/framework"],
  "Next.js": ["next"],
  PyTorch: ["torch"],
  Transformers: ["transformers"],
  Ollama: ["ollama"],
};

const DOMAIN_RULES: Array<[string, string[]]> = [
  ["Backend Architecture", ["php", "python", "go", "java", "rust", "api", "backend"]],
  ["Frontend", ["typescript", "javascript", "react", "vue", "css", "frontend"]],
  ["AI Engineering", ["llm", "rag", "langchain", "transformers", "pytorch", "ai", "ml"]],
  ["Cloud Infrastructure", ["docker", "kubernetes", "terraform", "aws", "devops"]],
  ["Open Source", ["oss", "maintainer", "contributor"]],
  ["API Design", ["openapi", "graphql", "rest", "grpc", "api"]],
];

function levelFromScore(score: number): SkillLevel {
  if (score >= 8.5) return "expert";
  if (score >= 7.0) return "advanced";
  if (score >= 5.0) return "intermediate";
  if (score >= 3.0) return "emerging";
  return "minimal";
}

function confidenceFromEvidenceCount(count: number): Confidence {
  if (count >= 4) return "high";
  if (count >= 2) return "medium";
  return "low";
}

function normalizeLanguage(name?: string | null): string | undefined {
  if (!name) return undefined;
  return LANGUAGE_ALIASES[name.toLowerCase()] ?? name;
}

function topEntries(map: Map<string, number>, limit: number): Record<string, number> {
  return Object.fromEntries(
    [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit),
  );
}

export class SkillSignalsEngine {
  extract(githubData: GitHubProfileData) {
    const { user, repos } = githubData;
    const languages = new Map<string, number>();
    const topics = new Map<string, number>();
    const dependencyHits = new Map<string, number>();
    const repoEvidence: Evidence[] = [];

    for (const repo of repos) {
      const lang = normalizeLanguage(repo.language);
      if (lang) {
        languages.set(lang, (languages.get(lang) ?? 0) + Math.max(repo.stargazers_count ?? 0, 1));
      }

      for (const topic of repo.topics ?? []) {
        topics.set(topic.toLowerCase(), (topics.get(topic.toLowerCase()) ?? 0) + 1);
      }

      const depsBlob = (repo.dependency_markers ?? []).join(" ").toLowerCase();
      for (const [skill, markers] of Object.entries(DEPENDENCY_SIGNALS)) {
        if (markers.some((marker) => depsBlob.includes(marker))) {
          dependencyHits.set(skill, (dependencyHits.get(skill) ?? 0) + 1);
        }
      }

      if (lang || repo.description) {
        repoEvidence.push({
          type: "repository",
          title: repo.name,
          url: repo.html_url,
          summary: repo.description ?? `Primary language: ${lang ?? "unknown"}`,
          weight: Math.min(1, 0.3 + (repo.stargazers_count ?? 0) / 100),
        });
      }
    }

    return {
      user,
      languages: topEntries(languages, 15),
      topics: topEntries(topics, 20),
      dependencyHits: Object.fromEntries(dependencyHits),
      repoEvidence,
      stats: {
        repoCount: repos.length,
        totalStars: repos.reduce((sum, r) => sum + (r.stargazers_count ?? 0), 0),
        recentPushes: repos.filter((r) => r).length,
      },
    };
  }

  buildProfile(signals: ReturnType<SkillSignalsEngine["extract"]>): DeveloperProfile {
    const user = signals.user;
    const languages = signals.languages;
    const dependencyHits = signals.dependencyHits as Record<string, number>;
    const repoEvidence = signals.repoEvidence;
    const stats = signals.stats;

    const langValues = Object.values(languages);
    const maxLang = langValues.length ? Math.max(...langValues) : 1;
    const skills: SkillClaim[] = [];

    for (const [lang, weight] of Object.entries(languages)) {
      const score = Math.min(10, 3 + (weight / maxLang) * 6.5);
      let evidence = repoEvidence.filter((e) => e.summary.toLowerCase().includes(lang.toLowerCase())).slice(0, 3);
      if (!evidence.length) evidence = repoEvidence.slice(0, 2);
      skills.push({
        name: lang,
        level: levelFromScore(score),
        confidence: confidenceFromEvidenceCount(evidence.length),
        score: Math.round(score * 10) / 10,
        evidence,
      });
    }

    for (const [skill, hits] of Object.entries(dependencyHits)) {
      const score = Math.min(10, 4 + hits * 2);
      skills.push({
        name: skill,
        level: levelFromScore(score),
        confidence: confidenceFromEvidenceCount(hits),
        score: Math.round(score * 10) / 10,
        evidence: [
          {
            type: "dependency",
            title: skill,
            summary: `Detected in ${hits} repository dependency manifests`,
            weight: 0.7,
          },
        ],
      });
    }

    skills.sort((a, b) => b.score - a.score);

    const corpus = [
      Object.keys(languages).join(" "),
      Object.keys(signals.topics).join(" "),
      Object.keys(dependencyHits).join(" "),
    ]
      .join(" ")
      .toLowerCase();

    const domains: DomainClaim[] = [];
    for (const [domain, keywords] of DOMAIN_RULES) {
      const hits = keywords.filter((kw) => corpus.includes(kw)).length;
      if (!hits) continue;
      domains.push({
        name: domain,
        level: levelFromScore(Math.min(10, 3 + hits * 1.5)),
        confidence: confidenceFromEvidenceCount(1),
        evidence: [
          {
            type: "topic",
            title: domain,
            summary: `Matched ${hits} domain keyword signals`,
            weight: Math.min(1, hits / 5),
          },
        ],
      });
    }

    domains.sort((a, b) => {
      const order = { expert: 5, advanced: 4, intermediate: 3, emerging: 2, minimal: 1 };
      return order[b.level] - order[a.level];
    });

    const primaryStack = skills.slice(0, 5).map((s) => s.name);
    const strengths = domains.slice(0, 3).map((d) => d.name);
    if (!strengths.length) strengths.push("General Software Development");

    const weaknesses: string[] = [];
    if (stats.repoCount < 5) weaknesses.push("Limited public repository footprint");
    if (!domains.some((d) => d.name === "Open Source")) {
      weaknesses.push("Open Source Contributions");
    }
    if (!skills.some((s) => s.name.toLowerCase() === "markdown")) {
      weaknesses.push("Technical Writing");
    }

    const maturity = Math.min(
      10,
      2 + Math.min(stats.repoCount, 20) * 0.2 + Math.min(stats.totalStars, 500) / 100 + skills.length * 0.2,
    );

    const summary =
      `${user.login} shows strongest activity in ${primaryStack.slice(0, 3).join(", ") || "software development"}. ` +
      `Public footprint spans ${stats.repoCount} analyzed repositories with ${stats.totalStars} total stars.`;

    return {
      username: user.login,
      displayName: user.name ?? undefined,
      bio: user.bio ?? undefined,
      analyzedAt: new Date().toISOString(),
      summary,
      primaryStack,
      skills: skills.slice(0, 12),
      domains: domains.slice(0, 6),
      strengths,
      weaknesses,
      maturityScore: Math.round(maturity * 10) / 10,
      repoCount: stats.repoCount,
      publicRepos: user.public_repos ?? stats.repoCount,
      totalStars: stats.totalStars,
      metadata: {},
    };
  }
}
