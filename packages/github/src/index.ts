export { GitHubClient, GitHubIngestor } from "./client.js";
export type { IngestProgress } from "./client.js";
export { hasGitHubAuth, resolveAuthenticatedUsername } from "./auth.js";
export {
  ensureGitHubMcpServer,
  GITHUB_MCP_SERVER_NAME,
  GITHUB_MCP_ACTION_TOOLS,
  GITHUB_MCP_DEFAULT,
  isGitHubMcpEnabled,
  resolveGitHubTokenForMcp,
} from "./mcp-setup.js";
export { GitHubRepoDiscovery, buildDiscoveryQueries } from "./discovery.js";
export { resolveForkTarget, formatForkResult } from "./fork.js";
