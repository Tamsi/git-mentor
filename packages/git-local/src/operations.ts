import fs from "node:fs";
import path from "node:path";
import { WORKSPACES_DIR } from "@git-mentor/core";
import { CLONE_TIMEOUT_MS, runGit } from "./git-runner.js";
import {
  isGitRepository,
  listWorkspaceEntries,
  workspacePathFor,
  type WorkspaceEntry,
} from "./workspace-path.js";

export interface GitOperationResult {
  ok: boolean;
  path: string;
  summary: string;
  stdout?: string;
  stderr?: string;
}

function defaultCloneUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}.git`;
}

export async function gitClone(options: {
  owner: string;
  repo: string;
  remote_url?: string;
  branch?: string;
  depth?: number;
  force?: boolean;
}): Promise<GitOperationResult> {
  fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
  const target = workspacePathFor(options.owner, options.repo);
  const exists = fs.existsSync(target);

  if (exists && isGitRepository(target)) {
    if (!options.force) {
      throw new Error(
        `Workspace already exists at ${target}. Use git_pull or pass force: true to re-clone.`,
      );
    }
    fs.rmSync(target, { recursive: true, force: true });
  } else if (exists) {
    fs.rmSync(target, { recursive: true, force: true });
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  const url = options.remote_url?.trim() || defaultCloneUrl(options.owner, options.repo);
  const args = ["clone"];
  const depth = options.depth ?? 1;
  if (depth > 0) args.push("--depth", String(depth));
  if (options.branch) {
    args.push("--branch", options.branch);
  }
  args.push(url, target);

  const { stdout, stderr } = await runGit(args, { timeoutMs: CLONE_TIMEOUT_MS });
  return {
    ok: true,
    path: target,
    summary: `Cloned ${options.owner}/${options.repo} (depth=${depth > 0 ? depth : "full"})`,
    stdout,
    stderr,
  };
}

export async function gitPull(owner: string, repo: string): Promise<GitOperationResult> {
  const target = workspacePathFor(owner, repo);
  if (!isGitRepository(target)) {
    throw new Error(`No git workspace at ${target}. Run git_clone first.`);
  }
  const { stdout, stderr } = await runGit(["pull", "--ff-only"], { cwd: target });
  return {
    ok: true,
    path: target,
    summary: `Pulled ${owner}/${repo}`,
    stdout,
    stderr,
  };
}

export async function gitStatus(owner: string, repo: string): Promise<GitOperationResult> {
  const target = workspacePathFor(owner, repo);
  if (!isGitRepository(target)) {
    throw new Error(`No git workspace at ${target}. Run git_clone first.`);
  }
  const branch = await runGit(["branch", "--show-current"], { cwd: target });
  const status = await runGit(["status", "--porcelain", "-b"], { cwd: target });
  return {
    ok: true,
    path: target,
    summary: `Branch: ${branch.stdout.trim() || "(detached)"}`,
    stdout: status.stdout,
    stderr: status.stderr,
  };
}

export async function gitLog(
  owner: string,
  repo: string,
  maxCount = 20,
): Promise<GitOperationResult> {
  const target = workspacePathFor(owner, repo);
  if (!isGitRepository(target)) {
    throw new Error(`No git workspace at ${target}. Run git_clone first.`);
  }
  const count = Math.min(Math.max(1, Math.floor(maxCount)), 100);
  const { stdout, stderr } = await runGit(
    ["log", "--oneline", `-n`, String(count)],
    { cwd: target },
  );
  return {
    ok: true,
    path: target,
    summary: `Last ${count} commits`,
    stdout,
    stderr,
  };
}

export async function gitBranchList(owner: string, repo: string): Promise<GitOperationResult> {
  const target = workspacePathFor(owner, repo);
  if (!isGitRepository(target)) {
    throw new Error(`No git workspace at ${target}. Run git_clone first.`);
  }
  const { stdout, stderr } = await runGit(["branch", "-a"], { cwd: target });
  return {
    ok: true,
    path: target,
    summary: "Branches",
    stdout,
    stderr,
  };
}

export async function gitDiffStat(
  owner: string,
  repo: string,
  base?: string,
  head?: string,
): Promise<GitOperationResult> {
  const target = workspacePathFor(owner, repo);
  if (!isGitRepository(target)) {
    throw new Error(`No git workspace at ${target}. Run git_clone first.`);
  }
  const args =
    base && head
      ? ["diff", "--stat", `${base}..${head}`]
      : base
        ? ["diff", "--stat", base]
        : ["diff", "--stat"];
  const { stdout, stderr } = await runGit(args, { cwd: target });
  return {
    ok: true,
    path: target,
    summary: base && head ? `diff ${base}..${head}` : "unstaged/staged diff stat",
    stdout,
    stderr,
  };
}

export function gitListWorkspaces(): { workspaces: WorkspaceEntry[] } {
  return { workspaces: listWorkspaceEntries() };
}
