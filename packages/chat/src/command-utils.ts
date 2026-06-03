export function stripAtUsername(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
}

export function isProfileAnalyzeTarget(value: string): boolean {
  const normalized = stripAtUsername(value).toLowerCase();
  return normalized === "profile" || normalized === "me" || normalized === "self";
}

export function formatCommandError(error: unknown, context?: string): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Ollama error")) {
    const prefix = "Ollama error: ";
    return `LLM error: ${message.startsWith(prefix) ? message.slice(prefix.length) : message}`;
  }

  const status = (error as { status?: number })?.status;
  if (status === 404) {
    return context
      ? `Repository **${context}** not found. Check the name or use \`/analyze profile\` for your GitHub career profile.`
      : "GitHub resource not found. Use `/analyze profile` for your career profile.";
  }

  return `Error: ${message}`;
}

/** @deprecated Use formatCommandError */
export function formatGitHubError(error: unknown, context?: string): string {
  return formatCommandError(error, context);
}
