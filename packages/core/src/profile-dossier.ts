import fs from "node:fs";
import path from "node:path";
import { normalizeAnalysisResult } from "./analysis-normalize.js";
import type { AnalysisResult } from "./schemas.js";
import { REPORTS_DIR, ensureDirs } from "./config.js";
import { formatAttractivenessMarkdown, type ProfileAttractiveness } from "./profile-attractiveness.js";
import { renderMarkdown } from "./export.js";

export interface ProfileDossierRecord {
  savedAt: string;
  roleId: string;
  username: string;
  result: AnalysisResult;
}

export function profileDossierPaths(username: string): { json: string; markdown: string } {
  const safe = username.replace(/^@/, "");
  return {
    json: path.join(REPORTS_DIR, `${safe}.dossier.json`),
    markdown: path.join(REPORTS_DIR, `${safe}.md`),
  };
}

export function saveProfileDossier(
  result: AnalysisResult,
  roleId: string,
): { json: string; markdown: string } {
  ensureDirs();
  const paths = profileDossierPaths(result.profile.username);
  const record: ProfileDossierRecord = {
    savedAt: new Date().toISOString(),
    roleId,
    username: result.profile.username,
    result,
  };

  fs.writeFileSync(paths.json, JSON.stringify(record, null, 2));
  fs.writeFileSync(paths.markdown, renderProfileDossierMarkdown(result));
  return paths;
}

export function loadProfileDossier(
  username: string,
  roleId: string,
  ttlHours = 24,
): AnalysisResult | null {
  const paths = profileDossierPaths(username);
  if (!fs.existsSync(paths.json)) return null;

  try {
    const record = JSON.parse(fs.readFileSync(paths.json, "utf8")) as ProfileDossierRecord;
    if (record.roleId !== roleId) return null;
    if (record.username.replace(/^@/, "") !== username.replace(/^@/, "")) return null;

    const ageMs = Date.now() - new Date(record.savedAt).getTime();
    if (ageMs > ttlHours * 60 * 60 * 1000) return null;

    return normalizeAnalysisResult(record.result);
  } catch {
    return null;
  }
}

export function renderProfileDossierMarkdown(result: AnalysisResult): string {
  const attractiveness = result.profile.metadata?.attractiveness as ProfileAttractiveness | undefined;
  const attractivenessSection = attractiveness ? `${formatAttractivenessMarkdown(attractiveness)}\n\n` : "";

  return `${attractivenessSection}${renderMarkdown(result)}`;
}

export function getProfileDossierMarkdownPath(username: string): string {
  return profileDossierPaths(username).markdown;
}
