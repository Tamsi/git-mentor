import { z } from "zod";
import {
  createDiscussion,
  createDiscussionComment,
  getDiscussion,
  listDiscussionComments,
  listDiscussions,
} from "./discussions.js";
import { listFollowers } from "./followers.js";
import { listFollowing } from "./following.js";
import {
  getRepository,
  getRepositoryFile,
  getUser,
  listRepositoryBranches,
  listRepositoryCommits,
  listStarredRepositories,
  listUserRepositories,
} from "./github-read.js";
import { searchCode, searchRepositories } from "./github-search.js";
import { GitHubRestClient } from "./github-rest.js";
import {
  GitHubWriteClient,
  createRepository,
  forkRepository,
  followUser,
  unfollowUser,
  type UpdateRepositoryMetadataInput,
  type UpdateUserProfileInput,
  type UpsertRepositoryFileInput,
} from "./github-write.js";
import {
  GITHUB_MCP_SHIPPED_TOOL_NAMES,
  GITHUB_MCP_TOOL_DEFINITIONS,
} from "./mcp-github-tool-definitions.js";

export { GITHUB_MCP_TOOL_DEFINITIONS, GITHUB_MCP_SHIPPED_TOOL_NAMES };
export const GITHUB_MCP_SHIPPED_TOOLS = GITHUB_MCP_SHIPPED_TOOL_NAMES;

const UsernamePagesSchema = z.object({
  username: z.string().optional(),
  per_page: z.number().int().min(1).max(100).optional(),
  max_pages: z.number().int().min(1).max(10).optional(),
});

const OwnerRepoSchema = z.object({
  owner: z.string(),
  repo: z.string(),
});

export async function callGitHubMcpTool(
  name: string,
  args: Record<string, unknown>,
  clients?: { rest?: GitHubRestClient; write?: GitHubWriteClient },
): Promise<unknown> {
  const rest = clients?.rest ?? new GitHubRestClient();
  const write = clients?.write ?? new GitHubWriteClient(rest);

  switch (name) {
    case "get_user":
      return getUser(rest, z.object({ username: z.string().optional() }).parse(args).username);

    case "list_following": {
      const p = UsernamePagesSchema.parse(args);
      return listFollowing(rest, {
        username: p.username,
        perPage: p.per_page,
        maxPages: p.max_pages,
      });
    }

    case "list_followers": {
      const p = UsernamePagesSchema.parse(args);
      return listFollowers(rest, {
        username: p.username,
        perPage: p.per_page,
        maxPages: p.max_pages,
      });
    }

    case "list_user_repositories": {
      const p = z
        .object({
          username: z.string().optional(),
          type: z.enum(["all", "owner", "member", "public"]).optional(),
          sort: z.enum(["created", "updated", "pushed", "full_name"]).optional(),
          per_page: z.number().int().optional(),
          max_pages: z.number().int().optional(),
        })
        .parse(args);
      return listUserRepositories(rest, {
        username: p.username,
        type: p.type,
        sort: p.sort,
        perPage: p.per_page,
        maxPages: p.max_pages,
      });
    }

    case "get_repository": {
      const p = OwnerRepoSchema.parse(args);
      return getRepository(rest, p.owner, p.repo);
    }

    case "get_repository_file": {
      const p = z
        .object({ owner: z.string(), repo: z.string(), path: z.string(), ref: z.string().optional() })
        .parse(args);
      return getRepositoryFile(rest, p.owner, p.repo, p.path, p.ref);
    }

    case "list_repository_commits": {
      const p = OwnerRepoSchema.extend({ max_count: z.number().int().optional() }).parse(args);
      return listRepositoryCommits(rest, p.owner, p.repo, p.max_count);
    }

    case "list_repository_branches": {
      const p = OwnerRepoSchema.extend({ max_count: z.number().int().optional() }).parse(args);
      return listRepositoryBranches(rest, p.owner, p.repo, p.max_count);
    }

    case "list_starred_repositories": {
      const p = UsernamePagesSchema.parse(args);
      return listStarredRepositories(rest, {
        username: p.username,
        perPage: p.per_page,
        maxPages: p.max_pages,
      });
    }

    case "search_repositories": {
      const p = z
        .object({
          query: z.string(),
          sort: z.string().optional(),
          order: z.enum(["asc", "desc"]).optional(),
          per_page: z.number().int().optional(),
        })
        .parse(args);
      return searchRepositories(rest, p.query, {
        sort: p.sort,
        order: p.order,
        perPage: p.per_page,
      });
    }

    case "search_code": {
      const p = z.object({ query: z.string(), per_page: z.number().int().optional() }).parse(args);
      return searchCode(rest, p.query, { perPage: p.per_page });
    }

    case "list_discussions": {
      const p = z
        .object({
          owner: z.string(),
          repo: z.string(),
          first: z.number().int().optional(),
          category_id: z.string().optional(),
        })
        .parse(args);
      return listDiscussions(rest, p.owner, p.repo, {
        first: p.first,
        categoryId: p.category_id,
      });
    }

    case "get_discussion": {
      const p = z
        .object({
          owner: z.string(),
          repo: z.string(),
          discussion_number: z.number().int(),
        })
        .parse(args);
      return getDiscussion(rest, p.owner, p.repo, p.discussion_number);
    }

    case "list_discussion_comments": {
      const p = z
        .object({
          owner: z.string(),
          repo: z.string(),
          discussion_number: z.number().int(),
          first: z.number().int().optional(),
        })
        .parse(args);
      return listDiscussionComments(rest, p.owner, p.repo, p.discussion_number, {
        first: p.first,
      });
    }

    case "create_discussion": {
      const p = z
        .object({
          owner: z.string(),
          repo: z.string(),
          title: z.string(),
          body: z.string(),
          category_slug: z.string().optional(),
        })
        .parse(args);
      return createDiscussion(rest, p.owner, p.repo, p.title, p.body, p.category_slug);
    }

    case "create_discussion_comment": {
      const p = z
        .object({
          owner: z.string(),
          repo: z.string(),
          discussion_number: z.number().int(),
          body: z.string(),
        })
        .parse(args);
      return createDiscussionComment(rest, p.owner, p.repo, p.discussion_number, p.body);
    }

    case "fork_repository": {
      const p = z
        .object({
          owner: z.string(),
          repo: z.string(),
          organization: z.string().optional(),
        })
        .parse(args);
      return forkRepository(rest, p.owner, p.repo, p.organization);
    }

    case "follow_user":
      return followUser(rest, z.object({ username: z.string() }).parse(args).username);

    case "unfollow_user":
      return unfollowUser(rest, z.object({ username: z.string() }).parse(args).username);

    case "update_user_profile":
      return write.updateUserProfile(
        z
          .object({
            name: z.string().optional(),
            bio: z.string().optional(),
            company: z.string().optional(),
            blog: z.string().optional(),
            location: z.string().optional(),
            twitter_username: z.string().optional(),
            hireable: z.boolean().optional(),
          })
          .parse(args) as UpdateUserProfileInput,
      );

    case "create_repository": {
      const p = z
        .object({
          name: z.string(),
          description: z.string().optional(),
          private: z.boolean().optional(),
          auto_init: z.boolean().optional(),
          organization: z.string().optional(),
        })
        .parse(args);
      return createRepository(rest, p);
    }

    case "upsert_repository_file":
      return write.upsertRepositoryFile(
        z
          .object({
            owner: z.string(),
            repo: z.string(),
            path: z.string(),
            content: z.string(),
            message: z.string(),
            branch: z.string().optional(),
          })
          .parse(args) as UpsertRepositoryFileInput,
      );

    case "update_repository_metadata":
      return write.updateRepositoryMetadata(
        z
          .object({
            owner: z.string(),
            repo: z.string(),
            description: z.string().optional(),
            homepage: z.string().optional(),
            has_issues: z.boolean().optional(),
            has_wiki: z.boolean().optional(),
            is_template: z.boolean().optional(),
          })
          .parse(args) as UpdateRepositoryMetadataInput,
      );

    case "pin_repositories": {
      const p = z
        .object({
          owner: z.string().optional(),
          repositories: z.array(z.string()).min(1).max(6),
        })
        .parse(args);
      const login = p.owner?.replace(/^@/, "") ?? (await write.getAuthenticatedLogin());
      return write.pinRepositories(login, p.repositories);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
