import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CONNECT_URL_RE = /https:\/\/ollama\.com\/connect\?\S+/;
const SIGNED_IN_RE = /already signed in as user '([^']+)'/i;

export interface OllamaAuthStatus {
  signedIn: boolean;
  username?: string;
  connectUrl?: string;
  rawOutput?: string;
}

export function parseOllamaSignInOutput(output: string): OllamaAuthStatus {
  const trimmed = output.trim();
  const signedInMatch = trimmed.match(SIGNED_IN_RE);
  if (signedInMatch) {
    return { signedIn: true, username: signedInMatch[1], rawOutput: trimmed };
  }
  const connectUrl = trimmed.match(CONNECT_URL_RE)?.[0];
  return { signedIn: false, connectUrl, rawOutput: trimmed };
}

export async function getOllamaAuthStatus(): Promise<OllamaAuthStatus> {
  try {
    const { stdout, stderr } = await execFileAsync("ollama", ["signin"], { encoding: "utf8" });
    return parseOllamaSignInOutput(`${stdout}\n${stderr}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) {
      return { signedIn: false, rawOutput: "ollama CLI not found" };
    }
    const execError = error as { stdout?: string; stderr?: string };
    const output = `${execError.stdout ?? ""}\n${execError.stderr ?? ""}`.trim();
    if (output) return parseOllamaSignInOutput(output);
    return { signedIn: false, rawOutput: message };
  }
}

export async function openUrl(url: string): Promise<void> {
  const platform = process.platform;
  if (platform === "darwin") {
    await execFileAsync("open", [url]);
    return;
  }
  if (platform === "win32") {
    await execFileAsync("cmd", ["/c", "start", "", url]);
    return;
  }
  await execFileAsync("xdg-open", [url]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function signInToOllama(options?: {
  openBrowser?: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
  onStatus?: (message: string) => void;
}): Promise<{ username: string; connectUrl?: string }> {
  const status = await getOllamaAuthStatus();
  if (status.signedIn && status.username) {
    return { username: status.username };
  }

  if (!status.connectUrl) {
    throw new Error(
      status.rawOutput?.includes("not found")
        ? "Ollama CLI not found. Install from https://ollama.com/download"
        : "Could not start Ollama sign-in. Is Ollama running?",
    );
  }

  options?.onStatus?.("Opening browser for Ollama sign-in…");
  if (options?.openBrowser !== false) {
    try {
      await openUrl(status.connectUrl);
    } catch {
      options?.onStatus?.(`Open this URL in your browser:\n${status.connectUrl}`);
    }
  } else {
    options?.onStatus?.(`Sign in at:\n${status.connectUrl}`);
  }

  const pollIntervalMs = options?.pollIntervalMs ?? 2000;
  const timeoutMs = options?.timeoutMs ?? 300_000;
  const deadline = Date.now() + timeoutMs;

  options?.onStatus?.("Waiting for sign-in… (complete login in your browser)");
  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    const check = await getOllamaAuthStatus();
    if (check.signedIn && check.username) {
      return { username: check.username, connectUrl: status.connectUrl };
    }
  }

  throw new Error("Ollama sign-in timed out. Try again with `/model signin`.");
}
