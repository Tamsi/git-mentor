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
export {
  buildGithubMcpServerEntry,
  migrateGithubMcpServerIfLegacy,
  usesLegacyGithubMcpServer,
} from "./mcp-setup.js";
