import fs from "node:fs";
import path from "node:path";
import { WORKSPACES_DIR } from "@git-mentor/core";

const SLUG_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;

export function assertRepoSlug(value: string, label: string): void {
  if (!SLUG_RE.test(value)) {
    throw new Error(`Invalid ${label}: must be alphanumeric with . _ - (got "${value}")`);
  }
}

export function workspacePathFor(owner: string, repo: string): string {
  assertRepoSlug(owner, "owner");
  assertRepoSlug(repo, "repo");
  const root = path.resolve(WORKSPACES_DIR);
  const target = path.resolve(root, owner, repo);
  if (!target.startsWith(root + path.sep) && target !== root) {
    throw new Error("Workspace path escapes workspaces root");
  }
  return target;
}

export function isGitRepository(dir: string): boolean {
  return fs.existsSync(path.join(dir, ".git"));
}

export interface WorkspaceEntry {
  owner: string;
  repo: string;
  path: string;
  mtimeMs: number;
}

export function listWorkspaceEntries(): WorkspaceEntry[] {
  if (!fs.existsSync(WORKSPACES_DIR)) return [];
  const entries: WorkspaceEntry[] = [];
  for (const owner of fs.readdirSync(WORKSPACES_DIR, { withFileTypes: true })) {
    if (!owner.isDirectory()) continue;
    const ownerPath = path.join(WORKSPACES_DIR, owner.name);
    for (const repoDir of fs.readdirSync(ownerPath, { withFileTypes: true })) {
      if (!repoDir.isDirectory()) continue;
      const full = path.join(ownerPath, repoDir.name);
      if (!isGitRepository(full)) continue;
      const stat = fs.statSync(full);
      entries.push({
        owner: owner.name,
        repo: repoDir.name,
        path: full,
        mtimeMs: stat.mtimeMs,
      });
    }
  }
  return entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
}
