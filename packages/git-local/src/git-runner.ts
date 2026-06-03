import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const MAX_GIT_OUTPUT = 64 * 1024;
export const CLONE_TIMEOUT_MS = 120_000;
export const DEFAULT_TIMEOUT_MS = 60_000;

export function truncateOutput(text: string): string {
  if (text.length <= MAX_GIT_OUTPUT) return text;
  return `${text.slice(0, MAX_GIT_OUTPUT)}\n… (truncated)`;
}

export async function runGit(
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd: options.cwd,
      timeout: timeoutMs,
      maxBuffer: MAX_GIT_OUTPUT * 2,
      encoding: "utf8",
    });
    return {
      stdout: truncateOutput(String(stdout ?? "")),
      stderr: truncateOutput(String(stderr ?? "")),
      code: 0,
    };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; code?: number; message?: string };
    const code = typeof err.code === "number" ? err.code : 1;
    const stdout = truncateOutput(String(err.stdout ?? ""));
    const stderr = truncateOutput(String(err.stderr ?? err.message ?? "git failed"));
    if (code !== 0) {
      const detail = stderr || stdout || "git command failed";
      throw new Error(detail.trim());
    }
    return { stdout, stderr, code };
  }
}

export function isGitInstalled(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore", timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}
