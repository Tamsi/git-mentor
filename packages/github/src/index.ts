export { GitHubClient, GitHubIngestor } from "./client.js";
export type { IngestProgress } from "./client.js";
export { hasGitHubAuth, resolveAuthenticatedUsername } from "./auth.js";
export {
  formatGitHubAuthStatusMarkdown,
  formatPostAuthMessage,
  getGitHubAuthReport,
  GITMENTOR_GH_SCOPES,
  isGhCliInstalled,
  readGhAuthStatus,
  runGhAuthInteractive,
  syncGitHubMcpInConfig,
} from "./gh-auth.js";
export {
  ensureGitHubMcpServer,
  GITHUB_MCP_SERVER_NAME,
  GITHUB_MCP_ACTION_TOOLS,
  GITHUB_MCP_SHIPPED_TOOLS,
  GITHUB_MCP_PLANNED_TOOLS,
  GITHUB_MCP_DEFAULT,
  isGitHubMcpEnabled,
  resolveGitHubTokenForMcp,
} from "./mcp-setup.js";
export { GitHubRepoDiscovery, buildDiscoveryQueries } from "./discovery.js";
export {
  GitHubProfileDiscovery,
  ROLE_PROFILE_HINTS,
  buildProfileFollowCandidates,
  formatProfilesToFollowMarkdown,
} from "./profile-discovery.js";
export { resolveForkTarget, formatForkResult } from "./fork.js";
export {
  assertCanFollowUsers,
  formatMissingFollowScopeMessage,
  resolveGitHubOAuthScopes,
  tokenCanFollowUsers,
} from "./scopes.js";
export { formatFollowResultsMarkdown, parseFollowUserMcpResult } from "./follow.js";
export type { FollowUserResult } from "./follow.js";
export { listFollowing, formatFollowingListMarkdown, resolveGitHubLogin } from "./following.js";
export type { ListFollowingResult, FollowingUserEntry } from "./following.js";
export { listFollowers, formatFollowersListMarkdown } from "./followers.js";
export type { ListFollowersResult, FollowerUserEntry } from "./followers.js";
export {
  getUser,
  listUserRepositories,
  getRepository,
  getRepositoryFile,
  listRepositoryCommits,
  listRepositoryBranches,
  listStarredRepositories,
} from "./github-read.js";
export { searchRepositories, searchCode, searchDiscussions } from "./github-search.js";
export {
  listDiscussions,
  getDiscussion,
  listDiscussionComments,
  createDiscussion,
  createDiscussionComment,
  listMyDiscussions,
  formatDiscussionsListMarkdown,
  formatMyDiscussionsMarkdown,
  parseRepoFromDiscussionSearchQuery,
} from "./discussions.js";
export {
  buildGithubMcpServerEntry,
  migrateGithubMcpServerIfLegacy,
  usesLegacyGithubMcpServer,
} from "./mcp-setup.js";
export { GITHUB_MCP_TOOL_DEFINITIONS, callGitHubMcpTool } from "./mcp-github-handlers.js";
export { GitHubRestClient } from "./github-rest.js";
export { GitHubWriteClient } from "./github-write.js";
