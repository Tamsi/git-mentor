export interface FollowUserResult {
  username: string;
  status: "followed" | "already_following" | "failed";
  message?: string;
}

export function formatFollowResultsMarkdown(results: FollowUserResult[]): string {
  if (results.length === 0) {
    return "_No profiles to follow. Run `/follow` first, then `/follow apply` or say `follow them`._";
  }

  const lines = results.map((entry) => {
    if (entry.status === "followed") {
      return `- **@${entry.username}** — now following`;
    }
    if (entry.status === "already_following") {
      return `- **@${entry.username}** — already following`;
    }
    return `- **@${entry.username}** — failed: ${entry.message ?? "unknown error"}`;
  });

  const followed = results.filter((r) => r.status === "followed").length;
  const summary = `Followed **${followed}** of ${results.length} profile(s) on GitHub via MCP.`;
  return `${summary}\n\n${lines.join("\n")}`;
}

interface FollowUserMcpPayload {
  username?: string;
  status?: string;
  message?: string;
}

export function parseFollowUserMcpResult(raw: string, username: string): FollowUserResult {
  const clean = username.replace(/^@/, "");
  const trimmed = raw.trim();

  if (!trimmed) {
    return { username: clean, status: "failed", message: "Empty response from GitHub MCP" };
  }

  try {
    const parsed = JSON.parse(trimmed) as FollowUserMcpPayload;
    const name = parsed.username?.replace(/^@/, "") || clean;

    if (parsed.status === "followed" || parsed.status === "already_following") {
      return { username: name, status: parsed.status };
    }

    if (parsed.status === "failed") {
      return { username: name, status: "failed", message: parsed.message ?? trimmed };
    }
  } catch {
    // Non-JSON text from MCP isError responses — treat as failure, not success.
  }

  return { username: clean, status: "failed", message: trimmed };
}
