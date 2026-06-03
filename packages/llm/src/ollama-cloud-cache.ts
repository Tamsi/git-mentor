import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR, ensureDirs } from "@git-mentor/core";

const CACHE_FILE = path.join(CACHE_DIR, "ollama-cloud-access.json");
const TTL_MS = 6 * 60 * 60 * 1000;

export type OllamaCloudCacheScope = "curated" | "all";

interface CacheEntry {
  username: string;
  scope: OllamaCloudCacheScope;
  accessible: string[];
  updatedAt: string;
}

interface CacheFile {
  entries: CacheEntry[];
}

function readCacheFile(): CacheFile {
  ensureDirs();
  if (!fs.existsSync(CACHE_FILE)) return { entries: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as CacheFile;
    return raw?.entries ? raw : { entries: [] };
  } catch {
    return { entries: [] };
  }
}

function writeCacheFile(data: CacheFile): void {
  ensureDirs();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

export function readOllamaCloudAccessCache(
  username: string,
  scope: OllamaCloudCacheScope,
): string[] | null {
  const entry = readCacheFile().entries.find(
    (e) => e.username === username && e.scope === scope,
  );
  if (!entry) return null;
  if (Date.now() - Date.parse(entry.updatedAt) > TTL_MS) return null;
  return entry.accessible;
}

export function writeOllamaCloudAccessCache(
  username: string,
  scope: OllamaCloudCacheScope,
  accessible: string[],
): void {
  const file = readCacheFile();
  const rest = file.entries.filter((e) => !(e.username === username && e.scope === scope));
  rest.push({
    username,
    scope,
    accessible,
    updatedAt: new Date().toISOString(),
  });
  writeCacheFile({ entries: rest });
}

export function clearOllamaCloudAccessCache(username?: string): void {
  if (!username) {
    if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
    return;
  }
  const file = readCacheFile();
  writeCacheFile({ entries: file.entries.filter((e) => e.username !== username) });
}
