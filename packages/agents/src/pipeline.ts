import {
  getRole,
  SkillSignalsEngine,
  analyzeProfileAttractiveness,
  type AgentStepTrace,
  type AnalysisResult,
  type DeveloperProfile,
  type GapAnalysis,
  type GitHubProfileData,
  type GitMentorConfig,
  type RoleTemplate,
  type SkillLevel,
  type TrendingRepo,
} from "@git-mentor/core";
import { GitHubClient, GitHubIngestor, GitHubRepoDiscovery } from "@git-mentor/github";
import { LLMRouter } from "@git-mentor/llm";
import { buildProfileImprovements } from "./profile-improvement.js";

const LEVEL_RANK: Record<SkillLevel, number> = {
  minimal: 0,
  emerging: 1,
  intermediate: 2,
  advanced: 3,
  expert: 4,
};

function trace(
  agent: string,
  step: string,
  started: number,
  inputSummary: string,
  outputSummary: string,
): AgentStepTrace {
  return {
    agent,
    step,
    durationMs: Date.now() - started,
    inputSummary,
    outputSummary,
    metadata: {},
  };
}

export class ProfileSynthesizerAgent {
  constructor(
    private router: LLMRouter,
    private signalsEngine = new SkillSignalsEngine(),
  ) {}

  async synthesize(
    githubData: GitHubProfileData,
    signals: ReturnType<SkillSignalsEngine["extract"]>,
    attractiveness?: ReturnType<typeof analyzeProfileAttractiveness>,
  ): Promise<[DeveloperProfile, AgentStepTrace]> {
    const started = Date.now();
    const profile = this.signalsEngine.buildProfile(signals);
    if (attractiveness) {
      profile.metadata = {
        ...profile.metadata,
        attractiveness,
        profileReadmePresent: attractiveness.profileReadmePresent,
        pinnedCount: attractiveness.pinnedCount,
        recentActivityCount: attractiveness.recentActivityCount,
      };
    }

    const prompt =
      `Write a 2-sentence GitHub profile attractiveness summary for a hiring manager scanning this developer's public profile.\n` +
      `Focus on: bio, profile README, pinned repos, stats, portfolio presentation — not code-level repo analysis.\n` +
      `${profile.summary}\n` +
      `Attractiveness score: ${attractiveness?.score ?? "N/A"}/10\n` +
      `Stack: ${profile.primaryStack.join(", ")}\n` +
      `Strengths: ${profile.strengths.join(", ")}\n` +
      `Weaknesses: ${profile.weaknesses.join(", ")}`;

    try {
      const llm = await this.router.complete(prompt, "You write evidence-backed developer profile summaries.");
      if (llm.content.trim() && llm.provider !== "deterministic") {
        profile.summary = llm.content.trim();
      }
    } catch {
      // Rule-based summary from GitHub signals remains when LLM is unavailable.
    }

    return [
      profile,
      trace("profile-synthesizer", "synthesize", started, `repos=${githubData.repos.length}`, `skills=${profile.skills.length}, maturity=${profile.maturityScore}`),
    ];
  }
}

export class CareerCoachAgent {
  constructor(private router: LLMRouter) {}

  async analyze(profile: DeveloperProfile, role: RoleTemplate): Promise<[GapAnalysis, AgentStepTrace]> {
    const started = Date.now();
    const knownSkills = new Map(profile.skills.map((s) => [s.name.toLowerCase(), s]));
    const knownDomains = new Map(profile.domains.map((d) => [d.name.toLowerCase(), d]));
    const gaps: GapAnalysis["gaps"] = [];
    const strengths: string[] = [];

    for (const skill of role.requiredSkills) {
      const current = knownSkills.get(skill.toLowerCase());
      if (current && LEVEL_RANK[current.level] >= LEVEL_RANK.advanced) {
        strengths.push(skill);
        continue;
      }
      gaps.push({
        area: skill,
        currentLevel: current?.level ?? "minimal",
        targetLevel: "advanced",
        priority: 5,
        rationale: `${skill} is required for ${role.name} and is not yet strongly evidenced.`,
        evidenceGaps: [`Need more public work demonstrating ${skill}`],
      });
    }

    for (const domain of role.requiredDomains) {
      const current = knownDomains.get(domain.toLowerCase());
      if (current && LEVEL_RANK[current.level] >= LEVEL_RANK.intermediate) {
        if (!strengths.includes(domain)) strengths.push(domain);
        continue;
      }
      gaps.push({
        area: domain,
        currentLevel: current?.level ?? "minimal",
        targetLevel: "advanced",
        priority: 4,
        rationale: `${domain} is a core domain for ${role.name}.`,
        evidenceGaps: [],
      });
    }

    const fitScore = Math.max(1, 10 - gaps.length * 0.8);
    let summary = `Fit for ${role.name}: ${fitScore.toFixed(1)}/10. ${strengths.length} aligned strengths, ${gaps.length} gaps to close.`;

    try {
      const llm = await this.router.complete(
        `Improve this one-sentence career summary for a developer targeting ${role.name}:\n${summary}\nProfile: ${profile.summary}\nKeep under 40 words, factual.`,
        "You are a staff engineer writing concise career feedback.",
      );
      if (llm.content.trim()) summary = llm.content.trim();
    } catch {
      // Rule-based gap summary remains when LLM is unavailable.
    }

    return [
      {
        targetRole: role.name,
        fitScore: Math.round(fitScore * 10) / 10,
        summary,
        gaps,
        learningPlan: gaps.slice(0, 5).map((gap) => ({
          title: `Build evidence in ${gap.area}`,
          description: `Ship or contribute to a public project that demonstrates ${gap.area}.`,
          effort: gap.priority >= 4 ? "M" : "S",
          resources: [`Search GitHub trending repos tagged with ${gap.area}`],
        })),
        strengthsForRole: strengths,
      },
      trace("career-coach", "gap-analysis", started, `role=${role.id}`, `gaps=${gaps.length}, fit=${fitScore.toFixed(1)}`),
    ];
  }
}

const ROLE_REPOS: Record<string, string[]> = {
  "ai-engineer": ["langchain-ai/langgraph", "ollama/ollama", "huggingface/transformers"],
  "staff-engineer": ["kubernetes/kubernetes", "grpc/grpc", "prometheus/prometheus"],
  "oss-maintainer": ["firstcontributions/first-contributions", "up-for-grabs/up-for-grabs.net"],
};

export class GrowthAdvisorAgent {
  constructor(private discovery?: GitHubRepoDiscovery) {}

  async recommend(
    profile: DeveloperProfile,
    gapAnalysis: GapAnalysis | undefined,
    roleId = "ai-engineer",
    githubData?: GitHubProfileData,
    topN = 5,
    options?: { skipTrending?: boolean },
  ): Promise<[AnalysisResult["actionPlan"], AgentStepTrace]> {
    const started = Date.now();
    const recommendations = [];

    for (const weakness of profile.weaknesses.slice(0, 2)) {
      recommendations.push({
        title: `Improve ${weakness}`,
        category: "growth",
        description: `Create a recurring habit to address ${weakness.toLowerCase()}.`,
        effort: "M",
        rationale: `Detected as a profile weakness for @${profile.username}.`,
      });
    }

    if (gapAnalysis) {
      for (const gap of gapAnalysis.gaps.slice(0, 3)) {
        recommendations.push({
          title: `Close gap: ${gap.area}`,
          category: "learning",
          description: gap.rationale,
          effort: gap.priority >= 4 ? "M" : "S",
          rationale: `Required for ${gapAnalysis.targetRole}.`,
        });
      }
    }

    for (const skill of profile.primaryStack.slice(0, 2)) {
      recommendations.push({
        title: `Deepen expertise in ${skill}`,
        category: "depth",
        description: `Publish a technical write-up or OSS utility showcasing ${skill}.`,
        effort: "S",
        rationale: "Build on an existing strength with public evidence.",
      });
    }

    const technologiesToLearn = [
      ...(gapAnalysis?.gaps.slice(0, 5).map((g) => g.area) ?? []),
      ...["LangGraph", "MCP", "AI Evaluation"].filter(
        (t) => !gapAnalysis?.gaps.some((g) => g.area === t),
      ),
    ].slice(0, 5);

    let trendingRepos: TrendingRepo[] = [];
    if (this.discovery && !options?.skipTrending) {
      trendingRepos = await this.discovery.discoverTrending(profile, gapAnalysis, 6);
    }

    const profileImprovements = buildProfileImprovements(profile, gapAnalysis, githubData);
    const fallbackRepos = ROLE_REPOS[roleId] ?? ["github/explore", "sindresorhus/awesome"];

    return [
      {
        generatedAt: new Date().toISOString(),
        recommendations: recommendations.slice(0, topN),
        technologiesToLearn,
        reposToWatch: [...trendingRepos.map((r) => r.fullName), ...fallbackRepos].slice(0, 8),
        ossOpportunities: [
          "Find a repo in your primary stack with `good first issue` labels",
          "Review one PR per week in a project you depend on",
          "Fork a trending repo from `/trending` and submit a documentation fix",
        ],
        trendingRepos,
        profileImprovements,
      },
      trace(
        "growth-advisor",
        "recommendations",
        started,
        `username=${profile.username}`,
        `recommendations=${Math.min(recommendations.length, topN)}, trending=${trendingRepos.length}`,
      ),
    ];
  }
}

export class AnalysisPipeline {
  private ingestor: GitHubIngestor;
  private signalsEngine = new SkillSignalsEngine();
  private router: LLMRouter;
  private profileAgent: ProfileSynthesizerAgent;
  private coachAgent: CareerCoachAgent;
  private growthAgent: GrowthAdvisorAgent;

  constructor(private config: GitMentorConfig) {
    const client = new GitHubClient(config);
    this.ingestor = new GitHubIngestor(client);
    this.router = new LLMRouter(config);
    this.profileAgent = new ProfileSynthesizerAgent(this.router, this.signalsEngine);
    this.coachAgent = new CareerCoachAgent(this.router);
    this.growthAgent = new GrowthAdvisorAgent(new GitHubRepoDiscovery(client));
  }

  async runProfile(options: {
    username: string;
    roleId?: string;
    includeCoach?: boolean;
    includeGrowth?: boolean;
    repoLimit?: number;
    onProgress?: (message: string) => void;
  }): Promise<AnalysisResult> {
    return this.run(options);
  }

  async runRepo(options: {
    owner: string;
    repoName: string;
    onProgress?: (message: string) => void;
  }): Promise<import("@git-mentor/core").RepoAnalysisResult> {
    const { analyzeRepository } = await import("./repo-analysis.js");
    const repo = await this.ingestor.fetchRepoForAnalysis(
      options.owner,
      options.repoName,
      options.onProgress,
    );
    return analyzeRepository(options.owner, repo);
  }

  async run(options: {
    username: string;
    roleId?: string;
    includeCoach?: boolean;
    includeGrowth?: boolean;
    repoLimit?: number;
    githubData?: GitHubProfileData;
    onProgress?: (message: string) => void;
  }): Promise<AnalysisResult> {
    const traces: AgentStepTrace[] = [];
    const roleId = options.roleId ?? this.config.defaultRole;

    const ingestStarted = Date.now();
    const githubData =
      options.githubData ??
      (await this.ingestor.fetchProfileOnly(
        options.username,
        options.repoLimit ?? 30,
        options.onProgress,
      ));
    traces.push(trace("supervisor", "github-ingest", ingestStarted, `username=${options.username}`, `repos=${githubData.repos.length}`));

    const attractiveness = analyzeProfileAttractiveness(githubData);
    const signalsStarted = Date.now();
    const signals = this.signalsEngine.extract(githubData);
    traces.push(trace("supervisor", "skill-signals", signalsStarted, `repos=${githubData.repos.length}`, `languages=${Object.keys(signals.languages).length}`));

    const [profile, profileTrace] = await this.profileAgent.synthesize(githubData, signals, attractiveness);
    traces.push(profileTrace);

    let gapAnalysis: GapAnalysis | undefined;
    if (options.includeCoach !== false) {
      const role = getRole(roleId);
      const [gap, coachTrace] = await this.coachAgent.analyze(profile, role);
      gapAnalysis = gap;
      traces.push(coachTrace);
    }

    let actionPlan: AnalysisResult["actionPlan"];
    if (options.includeGrowth !== false) {
      const [plan, growthTrace] = await this.growthAgent.recommend(
        profile,
        gapAnalysis,
        roleId,
        githubData,
        5,
        { skipTrending: true },
      );
      actionPlan = plan;
      traces.push(growthTrace);
    }

    return { profile, gapAnalysis, actionPlan, traces, signals: { ...signals, _repos: githubData.repos } };
  }
}
