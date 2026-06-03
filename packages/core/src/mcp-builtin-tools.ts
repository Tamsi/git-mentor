/** Tools exposed by `gitmentor mcp` (built-in MCP server). Keep in sync with chat MCP handlers. */
export const GITMENTOR_BUILTIN_MCP_TOOLS = [
  "analyze_profile",
  "compare_role",
  "get_recommendations",
  "discover_trending_repos",
  "discover_profiles_to_follow",
  "improve_profile",
  "analyze_repository",
  "analyze_repository_for_user",
  "list_target_roles",
  "list_rules",
  "list_skills",
  "get_agent_context",
] as const;
