import { SkillSignalsEngine } from "@git-mentor/core";
import dataset from "./datasets/synthetic_profiles.json" with { type: "json" };

interface EvalEntry {
  id: string;
  github_data: Parameters<SkillSignalsEngine["extract"]>[0];
  ground_truth: {
    must_detect_skills: string[];
    must_detect_domains: string[];
    min_maturity: number;
  };
}

function recall(expected: string[], detected: string[]) {
  const detectedLower = new Set(detected.map((d) => d.toLowerCase()));
  const missing = expected.filter((item) => !detectedLower.has(item.toLowerCase()));
  return { score: expected.length ? (expected.length - missing.length) / expected.length : 1, missing };
}

export function runBenchmark() {
  const entries = dataset as EvalEntry[];
  const engine = new SkillSignalsEngine();
  const results = entries.map((entry) => {
    const signals = engine.extract(entry.github_data);
    const profile = engine.buildProfile(signals);
    const skillNames = profile.skills.map((s) => s.name);
    const domainNames = profile.domains.map((d) => d.name);
    const skill = recall(entry.ground_truth.must_detect_skills, skillNames);
    const domain = recall(entry.ground_truth.must_detect_domains, domainNames);
    const maturityOk = profile.maturityScore >= entry.ground_truth.min_maturity;
    const passed = skill.score >= 0.75 && domain.score >= 0.5 && maturityOk && skill.missing.length <= 1;
    return {
      profileId: entry.id,
      passed,
      skillRecall: skill.score,
      domainRecall: domain.score,
      missingSkills: skill.missing,
      missingDomains: domain.missing,
    };
  });

  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    passRate: results.length ? passed / results.length : 0,
    avgSkillRecall: results.reduce((s, r) => s + r.skillRecall, 0) / (results.length || 1),
    avgDomainRecall: results.reduce((s, r) => s + r.domainRecall, 0) / (results.length || 1),
    results,
  };
}

export function formatReport(report: ReturnType<typeof runBenchmark>): string {
  const lines = [
    "# git-mentor Skill Detection Benchmark",
    "",
    `- Profiles: ${report.total}`,
    `- Passed: ${report.passed}/${report.total} (${(report.passRate * 100).toFixed(0)}%)`,
    `- Avg skill recall: ${(report.avgSkillRecall * 100).toFixed(1)}%`,
    `- Avg domain recall: ${(report.avgDomainRecall * 100).toFixed(1)}%`,
    "",
  ];
  for (const result of report.results) {
    lines.push(`## [${result.passed ? "PASS" : "FAIL"}] ${result.profileId}`);
    lines.push(`- Skill recall: ${(result.skillRecall * 100).toFixed(1)}%`);
    lines.push(`- Domain recall: ${(result.domainRecall * 100).toFixed(1)}%`);
    if (result.missingSkills.length) lines.push(`- Missing skills: ${result.missingSkills.join(", ")}`);
    lines.push("");
  }
  return lines.join("\n");
}
