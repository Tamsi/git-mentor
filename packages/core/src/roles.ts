import type { RoleTemplate } from "./schemas.js";

export const ROLE_TEMPLATES: Record<string, RoleTemplate> = {
  "ai-engineer": {
    id: "ai-engineer",
    name: "AI Engineer",
    description: "Builds production AI systems: LLMs, RAG, agents, evals.",
    requiredSkills: ["Python", "LLM Engineering", "RAG", "API Design"],
    requiredDomains: ["AI Engineering", "Backend Architecture"],
    niceToHave: ["MCP", "LangGraph", "Evaluation", "Vector Databases"],
  },
  "full-stack": {
    id: "full-stack",
    name: "Full Stack Engineer",
    description: "Ships end-to-end product features across frontend and backend.",
    requiredSkills: ["TypeScript", "React", "API Design", "SQL"],
    requiredDomains: ["Frontend", "Backend Architecture"],
    niceToHave: ["DevOps", "Testing", "Performance"],
  },
  "staff-engineer": {
    id: "staff-engineer",
    name: "Staff Engineer",
    description: "Sets technical direction, unblocks teams, drives cross-cutting quality.",
    requiredSkills: ["System Design", "API Design", "Technical Leadership"],
    requiredDomains: ["Backend Architecture", "Cloud Infrastructure"],
    niceToHave: ["Mentoring", "Technical Writing", "Open Source"],
  },
  "software-architect": {
    id: "software-architect",
    name: "Software Architect",
    description: "Designs scalable systems and guides long-term platform decisions.",
    requiredSkills: ["System Design", "Cloud Infrastructure", "API Design"],
    requiredDomains: ["Backend Architecture", "Cloud Infrastructure"],
    niceToHave: ["Security", "Data Architecture", "Event-Driven Systems"],
  },
  "oss-maintainer": {
    id: "oss-maintainer",
    name: "Open Source Maintainer",
    description: "Leads community-driven projects with sustained OSS contributions.",
    requiredSkills: ["Open Source", "Technical Writing", "Code Review"],
    requiredDomains: ["Open Source", "Community"],
    niceToHave: ["CI/CD", "Documentation", "Release Management"],
  },
};

export function getRole(roleId: string): RoleTemplate {
  const key = roleId.toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  const role = ROLE_TEMPLATES[key];
  if (!role) {
    throw new Error(
      `Unknown role '${roleId}'. Available: ${Object.keys(ROLE_TEMPLATES).join(", ")}`,
    );
  }
  return role;
}

export function listRoles(): RoleTemplate[] {
  return Object.values(ROLE_TEMPLATES);
}
