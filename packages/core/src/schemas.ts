import { z } from "zod";

export const SkillLevel = z.enum(["expert", "advanced", "intermediate", "emerging", "minimal"]);
export type SkillLevel = z.infer<typeof SkillLevel>;

export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

export const EvidenceType = z.enum([
  "repository",
  "commit",
  "pull_request",
  "review",
  "dependency",
  "topic",
  "language",
]);
export type EvidenceType = z.infer<typeof EvidenceType>;

export const EvidenceSchema = z.object({
  type: EvidenceType,
  title: z.string(),
  url: z.string().url().optional(),
  summary: z.string(),
  weight: z.number().min(0).max(1).default(0.5),
  occurredAt: z.string().datetime().optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const SkillClaimSchema = z.object({
  name: z.string(),
  level: SkillLevel,
  confidence: Confidence,
  score: z.number().min(0).max(10),
  evidence: z.array(EvidenceSchema).default([]),
});
export type SkillClaim = z.infer<typeof SkillClaimSchema>;

export const DomainClaimSchema = z.object({
  name: z.string(),
  level: SkillLevel,
  confidence: Confidence,
  evidence: z.array(EvidenceSchema).default([]),
});
export type DomainClaim = z.infer<typeof DomainClaimSchema>;

export const DeveloperProfileSchema = z.object({
  username: z.string(),
  displayName: z.string().optional(),
  bio: z.string().optional(),
  analyzedAt: z.string().datetime(),
  summary: z.string(),
  primaryStack: z.array(z.string()).default([]),
  skills: z.array(SkillClaimSchema).default([]),
  domains: z.array(DomainClaimSchema).default([]),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  maturityScore: z.number().min(0).max(10),
  repoCount: z.number().default(0),
  publicRepos: z.number().default(0),
  totalStars: z.number().default(0),
  metadata: z.record(z.unknown()).default({}),
});
export type DeveloperProfile = z.infer<typeof DeveloperProfileSchema>;

export const GapItemSchema = z.object({
  area: z.string(),
  currentLevel: SkillLevel,
  targetLevel: SkillLevel,
  priority: z.number().min(1).max(5),
  rationale: z.string(),
  evidenceGaps: z.array(z.string()).default([]),
});
export type GapItem = z.infer<typeof GapItemSchema>;

export const LearningStepSchema = z.object({
  title: z.string(),
  description: z.string(),
  effort: z.string(),
  resources: z.array(z.string()).default([]),
});
export type LearningStep = z.infer<typeof LearningStepSchema>;

export const GapAnalysisSchema = z.object({
  targetRole: z.string(),
  fitScore: z.number().min(0).max(10),
  summary: z.string(),
  gaps: z.array(GapItemSchema).default([]),
  learningPlan: z.array(LearningStepSchema).default([]),
  strengthsForRole: z.array(z.string()).default([]),
});
export type GapAnalysis = z.infer<typeof GapAnalysisSchema>;

export const ActionItemSchema = z.object({
  title: z.string(),
  category: z.string(),
  description: z.string(),
  effort: z.string(),
  rationale: z.string(),
  url: z.string().url().optional(),
});
export type ActionItem = z.infer<typeof ActionItemSchema>;

export const RelevanceBaseSchema = z.object({
  url: z.string().url(),
  relevanceReason: z.string(),
});

export const TrendingRepoSchema = RelevanceBaseSchema.extend({
  fullName: z.string(),
  description: z.string().optional(),
  stars: z.number(),
  language: z.string().optional(),
  topics: z.array(z.string()).default([]),
  pushedAt: z.string().optional(),
});
export type TrendingRepo = z.infer<typeof TrendingRepoSchema>;

export const ProfileToFollowSchema = RelevanceBaseSchema.extend({
  username: z.string(),
  name: z.string().optional(),
  bio: z.string().optional(),
  followers: z.number().optional(),
  source: z.enum(["curated", "maintainer"]).default("curated"),
});
export type ProfileToFollow = z.infer<typeof ProfileToFollowSchema>;

export const ActionPlanGithubSchema = z.object({
  repos: z.array(TrendingRepoSchema).default([]),
  profiles: z.array(ProfileToFollowSchema).default([]),
});
export type ActionPlanGithub = z.infer<typeof ActionPlanGithubSchema>;

export const ProfileImprovementSchema = z.object({
  category: z.enum(["bio", "pinned", "readme", "oss", "activity", "portfolio", "skills"]),
  priority: z.number().min(1).max(5),
  title: z.string(),
  description: z.string(),
  action: z.string(),
});
export type ProfileImprovement = z.infer<typeof ProfileImprovementSchema>;

const LegacyActionPlanFieldsSchema = z.object({
  reposToWatch: z.array(z.string()).optional(),
  profilesToFollow: z.array(ProfileToFollowSchema).optional(),
  trendingRepos: z.array(TrendingRepoSchema).optional(),
});

export const ActionPlanSchema = z
  .object({
    generatedAt: z.string().datetime(),
    recommendations: z.array(ActionItemSchema).default([]),
    technologiesToLearn: z.array(z.string()).default([]),
    github: ActionPlanGithubSchema.default({ repos: [], profiles: [] }),
    ossOpportunities: z.array(z.string()).default([]),
    profileImprovements: z.array(ProfileImprovementSchema).default([]),
  })
  .merge(LegacyActionPlanFieldsSchema)
  .transform((plan) => ({
    generatedAt: plan.generatedAt,
    recommendations: plan.recommendations,
    technologiesToLearn: plan.technologiesToLearn,
    github:
      plan.github.repos.length > 0 || plan.github.profiles.length > 0
        ? plan.github
        : {
            repos: plan.trendingRepos ?? plan.github.repos,
            profiles: plan.profilesToFollow ?? plan.github.profiles,
          },
    ossOpportunities: plan.ossOpportunities,
    profileImprovements: plan.profileImprovements,
  }));
export type ActionPlan = z.infer<typeof ActionPlanSchema>;

export const AgentStepTraceSchema = z.object({
  agent: z.string(),
  step: z.string(),
  durationMs: z.number(),
  inputSummary: z.string(),
  outputSummary: z.string(),
  metadata: z.record(z.unknown()).default({}),
});
export type AgentStepTrace = z.infer<typeof AgentStepTraceSchema>;

export const GitHubRepoDataSchema = z.object({
  name: z.string(),
  html_url: z.string().optional(),
  description: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  stargazers_count: z.number().optional(),
  topics: z.array(z.string()).optional(),
  dependency_markers: z.array(z.string()).optional(),
  pushed_at: z.string().nullable().optional(),
  fork: z.boolean().optional(),
});

export const GitHubUserDataSchema = z.object({
  login: z.string(),
  name: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  public_repos: z.number().optional(),
  followers: z.number().optional(),
  following: z.number().optional(),
  public_gists: z.number().optional(),
  company: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  blog: z.string().nullable().optional(),
  twitter_username: z.string().nullable().optional(),
  created_at: z.string().optional(),
});

export const GitHubActivityEventSchema = z.object({
  type: z.string(),
  repo: z.string(),
  createdAt: z.string(),
});

export const GitHubProfileDataSchema = z.object({
  user: GitHubUserDataSchema,
  repos: z.array(GitHubRepoDataSchema),
  profileReadme: z.string().nullable().optional(),
  pinnedRepos: z.array(GitHubRepoDataSchema).optional(),
  recentActivity: z.array(GitHubActivityEventSchema).optional(),
});

export const AnalysisResultSchema = z.object({
  profile: DeveloperProfileSchema,
  gapAnalysis: GapAnalysisSchema.optional(),
  actionPlan: ActionPlanSchema.optional(),
  traces: z.array(AgentStepTraceSchema).default([]),
  signals: z.record(z.unknown()).default({}),
  githubData: GitHubProfileDataSchema.optional(),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

export const RepoAnalysisResultSchema = z.object({
  owner: z.string(),
  repoName: z.string(),
  fullName: z.string(),
  url: z.string().url().optional(),
  description: z.string().optional(),
  language: z.string().optional(),
  stars: z.number().default(0),
  topics: z.array(z.string()).default([]),
  manifests: z.array(z.string()).default([]),
  stackSignals: z.array(z.string()).default([]),
  summary: z.string(),
  analyzedAt: z.string().datetime(),
});
export type RepoAnalysisResult = z.infer<typeof RepoAnalysisResultSchema>;

export const RoleTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  requiredSkills: z.array(z.string()),
  requiredDomains: z.array(z.string()),
  niceToHave: z.array(z.string()).default([]),
});
export type RoleTemplate = z.infer<typeof RoleTemplateSchema>;

export interface GitHubRepoData {
  name: string;
  html_url?: string;
  description?: string | null;
  language?: string | null;
  stargazers_count?: number;
  topics?: string[];
  dependency_markers?: string[];
  pushed_at?: string | null;
  fork?: boolean;
}

export interface GitHubUserData {
  login: string;
  name?: string | null;
  bio?: string | null;
  public_repos?: number;
  followers?: number;
  following?: number;
  public_gists?: number;
  company?: string | null;
  location?: string | null;
  blog?: string | null;
  twitter_username?: string | null;
  created_at?: string;
}

export interface GitHubActivityEvent {
  type: string;
  repo: string;
  createdAt: string;
}

export interface GitHubProfileData {
  user: GitHubUserData;
  repos: GitHubRepoData[];
  profileReadme?: string | null;
  pinnedRepos?: GitHubRepoData[];
  recentActivity?: GitHubActivityEvent[];
}
