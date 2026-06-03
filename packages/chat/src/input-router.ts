export type InputRoute =
  | { kind: "empty" }
  | { kind: "command"; command: string }
  | { kind: "need-analysis" }
  | { kind: "chat"; message: string };

export function routeInput(
  trimmed: string,
  options: { hasProfile: boolean },
): InputRoute {
  if (!trimmed) return { kind: "empty" };
  if (trimmed.startsWith("/")) return { kind: "command", command: trimmed };
  if (!options.hasProfile) return { kind: "need-analysis" };
  return { kind: "chat", message: trimmed };
}
