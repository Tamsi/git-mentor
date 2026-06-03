import { parseOAuthScopesHeader } from "./scopes.js";

export const GITHUB_API = "https://api.github.com";
export const GITHUB_GRAPHQL = "https://api.github.com/graphql";
export const GITHUB_API_VERSION = "2022-11-28";

export type GitHubTokenSource = () => string;

export function defaultGitHubTokenSource(): string {
  const value =
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN ??
    process.env.GITHUB_TOKEN ??
    process.env.GIT_MENTOR_GITHUB_TOKEN;
  if (!value?.trim()) {
    throw new Error(
      "GitHub token required. Run `gitmentor auth login` or set GITHUB_TOKEN / GITHUB_PERSONAL_ACCESS_TOKEN.",
    );
  }
  return value.trim();
}

export function githubAuthHeaders(
  token: string,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    ...extra,
  };
}

export class GitHubRestClient {
  constructor(private readonly tokenSource: GitHubTokenSource = defaultGitHubTokenSource) {}

  token(): string {
    return this.tokenSource();
  }

  async fetch(url: string, init?: RequestInit): Promise<Response> {
    const headers = {
      ...githubAuthHeaders(this.token()),
      ...(init?.headers as Record<string, string> | undefined),
    };
    const response = await fetch(url, { ...init, headers });
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = (await response.json()) as { message?: string; documentation_url?: string };
        detail = body.message ?? detail;
        if (body.documentation_url) detail += ` — ${body.documentation_url}`;
      } catch {
        // ignore parse errors
      }
      if (response.status === 404 && detail.toLowerCase().includes("not found")) {
        const tokenScopes = parseOAuthScopesHeader(response.headers.get("x-oauth-scopes"));
        const accepted = parseOAuthScopesHeader(response.headers.get("x-accepted-oauth-scopes"));
        const scopeList =
          tokenScopes.length > 0 ? `Current token scopes: ${tokenScopes.join(", ")}.` : "";
        const need =
          accepted.length > 0
            ? `Required: ${accepted.join(" or ")}.`
            : "Required scopes may include `user` and `repo`.";
        throw new Error(
          `${detail}\n${scopeList} ${need}\nRun: gitmentor auth refresh — then retry.`,
        );
      }
      throw new Error(detail);
    }
    return response;
  }

  async getJson<T>(url: string): Promise<T> {
    const response = await this.fetch(url);
    return response.json() as Promise<T>;
  }

  async postJson<T>(url: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    const response = await this.fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return response.json() as Promise<T>;
  }

  async patchJson<T>(url: string, body: unknown): Promise<T> {
    const response = await this.fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.json() as Promise<T>;
  }

  async putJson<T>(url: string, body: unknown): Promise<T> {
    const response = await this.fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.json() as Promise<T>;
  }

  async delete(url: string): Promise<void> {
    await this.fetch(url, { method: "DELETE", headers: { "Content-Length": "0" } });
  }

  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await this.fetch(GITHUB_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const payload = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((e) => e.message).join("; "));
    }
    if (!payload.data) throw new Error("GitHub GraphQL returned no data.");
    return payload.data;
  }
}
