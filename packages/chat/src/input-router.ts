import type { ChatReply } from "./types.js";

export type InputRoute =
  | { kind: "empty" }
  | { kind: "command"; command: string }
  | { kind: "github-action"; run: () => Promise<ChatReply> }
  | { kind: "need-analysis" }
  | { kind: "chat"; message: string };

export function routeInput(
  trimmed: string,
  options: {
    hasProfile: boolean;
    tryGitHubAction: (input: string) => Promise<ChatReply> | null;
  },
): InputRoute {
  if (!trimmed) return { kind: "empty" };
  if (trimmed.startsWith("/")) return { kind: "command", command: trimmed };

  const githubAction = options.tryGitHubAction(trimmed);
  if (githubAction) return { kind: "github-action", run: () => githubAction };

  if (!options.hasProfile) return { kind: "need-analysis" };
  return { kind: "chat", message: trimmed };
}
