import fs from "node:fs";
import path from "node:path";
import type { GitMentorConfig } from "./config.js";
import { RULES_DIR, SKILLS_DIR } from "./config.js";

export const PROJECT_AGENT_DIR = ".git-mentor";

const MAX_SKILL_CHARS = 2_500;

export interface AgentRule {
  id: string;
  name: string;
  content: string;
  source: "user" | "project";
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  content: string;
  source: "user" | "project";
}

export interface AgentContextBundle {
  rules: AgentRule[];
  skills: AgentSkill[];
  activeSkillIds: string[];
}

function slugFromFilename(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

function parseSkillMeta(content: string, fallbackId: string): { name: string; description: string } {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const name = titleMatch?.[1]?.trim() ?? fallbackId;

  const whenMatch = content.match(/##\s+When to use\s*\n([\s\S]*?)(?=\n##|\n$)/i);
  const description = whenMatch?.[1]?.trim().split("\n")[0]?.replace(/^[-*]\s*/, "") ?? name;

  return { name, description };
}

function truncateSkillContent(content: string): string {
  if (content.length <= MAX_SKILL_CHARS) return content;
  return `${content.slice(0, MAX_SKILL_CHARS)}\n\n… (skill truncated for context budget)`;
}

function loadRulesFromDir(dir: string, source: AgentRule["source"]): AgentRule[] {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, "utf8").trim();
      const id = slugFromFilename(file);
      const titleMatch = content.match(/^#\s+(.+)$/m);
      return {
        id,
        name: titleMatch?.[1]?.trim() ?? id,
        content,
        source,
      };
    });
}

function loadSkillsFromDir(dir: string, source: AgentSkill["source"]): AgentSkill[] {
  if (!fs.existsSync(dir)) return [];

  const skills: AgentSkill[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const skillFile = path.join(dir, entry.name, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;

    const content = fs.readFileSync(skillFile, "utf8").trim();
    const meta = parseSkillMeta(content, entry.name);
    skills.push({
      id: entry.name,
      name: meta.name,
      description: meta.description,
      content,
      source,
    });
  }

  return skills.sort((a, b) => a.id.localeCompare(b.id));
}

export function loadAgentContext(config: GitMentorConfig, cwd = process.cwd()): AgentContextBundle {
  const projectRoot = path.join(cwd, PROJECT_AGENT_DIR);

  const rules = [
    ...loadRulesFromDir(RULES_DIR, "user"),
    ...loadRulesFromDir(path.join(projectRoot, "rules"), "project"),
  ];

  const skills = [
    ...loadSkillsFromDir(SKILLS_DIR, "user"),
    ...loadSkillsFromDir(path.join(projectRoot, "skills"), "project"),
  ];

  const activeSkillIds = (config.agent?.activeSkills ?? []).filter((id) =>
    skills.some((skill) => skill.id === id),
  );

  return { rules, skills, activeSkillIds };
}

export function formatRulesForPrompt(rules: AgentRule[]): string {
  if (rules.length === 0) return "";
  return rules.map((rule) => `## ${rule.name}\n${rule.content}`).join("\n\n");
}

export function formatSkillsForPrompt(skills: AgentSkill[], activeSkillIds: string[]): string {
  const active = skills.filter((skill) => activeSkillIds.includes(skill.id));
  if (active.length === 0) return "";

  return active
    .map((skill) => `## Skill: ${skill.name} (${skill.id})\n${truncateSkillContent(skill.content)}`)
    .join("\n\n");
}

export function formatAgentContextForPrompt(bundle: AgentContextBundle, config: GitMentorConfig): string {
  const rulesEnabled = config.agent?.rulesEnabled ?? true;
  const skillsEnabled = config.agent?.skillsEnabled ?? true;

  const rulesText = rulesEnabled ? formatRulesForPrompt(bundle.rules) : "";
  const skillsText = skillsEnabled ? formatSkillsForPrompt(bundle.skills, bundle.activeSkillIds) : "";

  if (!rulesText && !skillsText) return "";

  return [
    rulesText ? `=== USER RULES ===\n${rulesText}\n=== END RULES ===` : "",
    skillsText ? `=== ACTIVE SKILLS ===\n${skillsText}\n=== END SKILLS ===` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function formatRulesList(rules: AgentRule[]): string {
  if (rules.length === 0) {
    return "No rules loaded. Run `gitmentor init` or add `.md` files to `~/.config/git-mentor/rules/` or `.git-mentor/rules/`.";
  }
  return rules
    .map((rule) => `- **${rule.id}** — ${rule.name} _(${rule.source})_`)
    .join("\n");
}

export function formatSkillsList(bundle: AgentContextBundle): string {
  if (bundle.skills.length === 0) {
    return "No skills found. Run `gitmentor init` or add `SKILL.md` under `~/.config/git-mentor/skills/<id>/`.";
  }

  return bundle.skills
    .map((skill) => {
      const active = bundle.activeSkillIds.includes(skill.id) ? " ✓ active" : "";
      return `- **${skill.id}** — ${skill.name}${active}\n  ${skill.description} _(${skill.source})_`;
    })
    .join("\n");
}

export function resolveSkillIds(bundle: AgentContextBundle, ids: string[]): string[] {
  const known = new Set(bundle.skills.map((skill) => skill.id));
  return ids.filter((id) => known.has(id));
}
