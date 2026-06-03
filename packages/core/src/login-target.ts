export type LoginTarget = "both" | "gh" | "ollama";

export function parseLoginTargetArg(arg?: string): LoginTarget | null {
  if (!arg?.trim()) return "both";
  const t = arg.trim().toLowerCase();
  if (t === "gh" || t === "github") return "gh";
  if (t === "ollama") return "ollama";
  if (t === "both" || t === "all") return "both";
  return null;
}

/** Parse `/login`, `/login gh`, `/login ollama`, `/signin` (→ ollama). */
export function parseSlashLoginCommand(line: string): LoginTarget | null | "invalid" {
  const trimmed = line.trim();
  if (!trimmed.startsWith("/")) return null;

  const parts = trimmed.slice(1).split(/\s+/).filter(Boolean);
  const cmd = parts[0]?.toLowerCase();
  if (!cmd) return null;

  if (cmd === "signin") {
    if (parts.length > 1) return "invalid";
    return "ollama";
  }

  if (cmd === "model" && parts[1]?.toLowerCase() === "signin") {
    return "ollama";
  }

  if (cmd !== "login") return null;

  if (parts.length === 1) return "both";
  const target = parseLoginTargetArg(parts[1]);
  return target ?? "invalid";
}

export function formatLoginTargetLabel(target: LoginTarget): string {
  if (target === "both") return "GitHub + Ollama";
  if (target === "gh") return "GitHub";
  return "Ollama";
}
