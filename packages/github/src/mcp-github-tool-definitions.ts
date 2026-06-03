/** MCP tool schemas exposed by git-mentor-github-mcp (Ollama + /mcp call). */
export const GITHUB_MCP_TOOL_DEFINITIONS = [
  {
    name: "get_user",
    description: "Get GitHub user profile (login, bio, counts). Omit username for authenticated user.",
    inputSchema: {
      type: "object",
      properties: { username: { type: "string" } },
    },
  },
  {
    name: "list_following",
    description: "List accounts the user follows.",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string" },
        per_page: { type: "number" },
        max_pages: { type: "number" },
      },
    },
  },
  {
    name: "list_followers",
    description: "List accounts who follow the user (followers list).",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string" },
        per_page: { type: "number" },
        max_pages: { type: "number" },
      },
    },
  },
  {
    name: "list_user_repositories",
    description: "List repositories for a user (metadata).",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string" },
        type: { type: "string", description: "all | owner | member | public" },
        sort: { type: "string" },
        per_page: { type: "number" },
        max_pages: { type: "number" },
      },
    },
  },
  {
    name: "get_repository",
    description: "Get repository metadata (description, stars, default branch, has_discussions).",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "get_repository_file",
    description: "Read a text file from a repository (decoded content).",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        path: { type: "string" },
        ref: { type: "string", description: "branch or commit ref" },
      },
      required: ["owner", "repo", "path"],
    },
  },
  {
    name: "list_repository_commits",
    description: "List recent commits on the default branch.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        max_count: { type: "number" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "list_repository_branches",
    description: "List branch names in a repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        max_count: { type: "number" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "list_starred_repositories",
    description: "List repositories starred by a user.",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string" },
        per_page: { type: "number" },
        max_pages: { type: "number" },
      },
    },
  },
  {
    name: "search_repositories",
    description: "Search GitHub repositories (GitHub search query syntax).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        sort: { type: "string" },
        order: { type: "string", enum: ["asc", "desc"] },
        per_page: { type: "number" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_code",
    description: "Search code across GitHub.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        per_page: { type: "number" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_discussions",
    description:
      "List discussions in a repository (GraphQL). Use owner/repo `community/community` for GitHub Community, or any repo with Discussions enabled.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        first: { type: "number" },
        category_id: { type: "string" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "get_discussion",
    description: "Get a single discussion thread by number.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        discussion_number: { type: "number" },
      },
      required: ["owner", "repo", "discussion_number"],
    },
  },
  {
    name: "list_discussion_comments",
    description: "List comments on a discussion.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        discussion_number: { type: "number" },
        first: { type: "number" },
      },
      required: ["owner", "repo", "discussion_number"],
    },
  },
  {
    name: "create_discussion",
    description: "Create a new discussion (requires repo scope). category_slug defaults to general.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        category_slug: { type: "string" },
      },
      required: ["owner", "repo", "title", "body"],
    },
  },
  {
    name: "create_discussion_comment",
    description: "Reply on a discussion thread.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        discussion_number: { type: "number" },
        body: { type: "string" },
      },
      required: ["owner", "repo", "discussion_number", "body"],
    },
  },
  {
    name: "fork_repository",
    description: "Fork a GitHub repository to your account",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        organization: { type: "string" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "follow_user",
    description: "Follow a GitHub user (requires user:follow scope)",
    inputSchema: {
      type: "object",
      properties: { username: { type: "string" } },
      required: ["username"],
    },
  },
  {
    name: "unfollow_user",
    description: "Unfollow a GitHub user",
    inputSchema: {
      type: "object",
      properties: { username: { type: "string" } },
      required: ["username"],
    },
  },
  {
    name: "update_user_profile",
    description: "Update authenticated user profile fields (user scope).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        bio: { type: "string" },
        company: { type: "string" },
        blog: { type: "string" },
        location: { type: "string" },
        twitter_username: { type: "string" },
        hireable: { type: "boolean" },
      },
    },
  },
  {
    name: "create_repository",
    description: "Create a new repository under your account or an org.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        private: { type: "boolean" },
        auto_init: { type: "boolean" },
        organization: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "upsert_repository_file",
    description: "Create or update a file in a repository (base64 commit).",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        path: { type: "string" },
        content: { type: "string" },
        message: { type: "string" },
        branch: { type: "string" },
      },
      required: ["owner", "repo", "path", "content", "message"],
    },
  },
  {
    name: "update_repository_metadata",
    description: "Update repository description, homepage, flags.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        description: { type: "string" },
        homepage: { type: "string" },
        has_issues: { type: "boolean" },
        has_wiki: { type: "boolean" },
        is_template: { type: "boolean" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "pin_repositories",
    description: "Replace pinned repositories on profile (max 6).",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repositories: { type: "array", items: { type: "string" } },
      },
      required: ["repositories"],
    },
  },
] as const;

export const GITHUB_MCP_SHIPPED_TOOL_NAMES = GITHUB_MCP_TOOL_DEFINITIONS.map((t) => t.name);
