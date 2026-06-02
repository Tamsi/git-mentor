import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RULES_DIR, SKILLS_DIR, MCP_TOOLS_FILE, ensureDirs } from "@git-mentor/core";

const TEMPLATES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates",
  "agent",
);

function copyIfMissing(src: string, dest: string): boolean {
  if (fs.existsSync(dest)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function copySkillIfMissing(skillId: string, srcDir: string, destDir: string): boolean {
  const srcFile = path.join(srcDir, skillId, "SKILL.md");
  const destFile = path.join(destDir, skillId, "SKILL.md");
  if (!fs.existsSync(srcFile)) return false;
  return copyIfMissing(srcFile, destFile);
}

export function bootstrapAgentAssets(): { rulesCopied: number; skillsCopied: number; mcpDocsCopied: number } {
  ensureDirs();

  let rulesCopied = 0;
  const rulesTemplateDir = path.join(TEMPLATES_DIR, "rules");
  if (fs.existsSync(rulesTemplateDir)) {
    for (const file of fs.readdirSync(rulesTemplateDir).filter((f) => f.endsWith(".md"))) {
      if (copyIfMissing(path.join(rulesTemplateDir, file), path.join(RULES_DIR, file))) {
        rulesCopied += 1;
      }
    }
  }

  let skillsCopied = 0;
  const skillsTemplateDir = path.join(TEMPLATES_DIR, "skills");
  if (fs.existsSync(skillsTemplateDir)) {
    for (const entry of fs.readdirSync(skillsTemplateDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (copySkillIfMissing(entry.name, skillsTemplateDir, SKILLS_DIR)) {
        skillsCopied += 1;
      }
    }
  }

  let mcpDocsCopied = 0;
  const mcpToolsTemplate = path.join(TEMPLATES_DIR, "mcp", "tools.md");
  if (copyIfMissing(mcpToolsTemplate, MCP_TOOLS_FILE)) {
    mcpDocsCopied += 1;
  }

  return { rulesCopied, skillsCopied, mcpDocsCopied };
}

export function getAgentTemplateDir(): string {
  return TEMPLATES_DIR;
}
