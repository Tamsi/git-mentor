"""Skill detection benchmark against synthetic ground-truth profiles."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from git_mentor.core.signals.engine import SkillSignalsEngine

DATASET_PATH = Path(__file__).parent / "datasets" / "synthetic_profiles.json"


@dataclass
class ProfileEvalResult:
    profile_id: str
    passed: bool
    skill_recall: float
    domain_recall: float
    missing_skills: list[str] = field(default_factory=list)
    missing_domains: list[str] = field(default_factory=list)
    maturity_ok: bool = True
    detected_skills: list[str] = field(default_factory=list)
    detected_domains: list[str] = field(default_factory=list)


@dataclass
class BenchmarkReport:
    total: int
    passed: int
    avg_skill_recall: float
    avg_domain_recall: float
    results: list[ProfileEvalResult]

    @property
    def pass_rate(self) -> float:
        return self.passed / self.total if self.total else 0.0


def _recall(expected: list[str], detected: list[str]) -> tuple[float, list[str]]:
    if not expected:
        return 1.0, []
    detected_lower = {d.lower() for d in detected}
    hits = [item for item in expected if item.lower() in detected_lower]
    missing = [item for item in expected if item.lower() not in detected_lower]
    return len(hits) / len(expected), missing


def evaluate_profile(entry: dict) -> ProfileEvalResult:
    engine = SkillSignalsEngine()
    signals = engine.extract(entry["github_data"])
    profile = engine.build_profile(signals)
    truth = entry["ground_truth"]

    skill_names = [s.name for s in profile.skills]
    domain_names = [d.name for d in profile.domains]

    skill_recall, missing_skills = _recall(truth.get("must_detect_skills", []), skill_names)
    domain_recall, missing_domains = _recall(truth.get("must_detect_domains", []), domain_names)
    maturity_ok = profile.maturity_score >= truth.get("min_maturity", 0)

    passed = (
        skill_recall >= 0.75
        and domain_recall >= 0.5
        and maturity_ok
        and len(missing_skills) <= 1
    )

    return ProfileEvalResult(
        profile_id=entry["id"],
        passed=passed,
        skill_recall=round(skill_recall, 3),
        domain_recall=round(domain_recall, 3),
        missing_skills=missing_skills,
        missing_domains=missing_domains,
        maturity_ok=maturity_ok,
        detected_skills=skill_names,
        detected_domains=domain_names,
    )


def run_benchmark(dataset_path: Path | None = None) -> BenchmarkReport:
    path = dataset_path or DATASET_PATH
    entries = json.loads(path.read_text())
    results = [evaluate_profile(entry) for entry in entries]
    passed = sum(1 for r in results if r.passed)
    avg_skill = sum(r.skill_recall for r in results) / len(results) if results else 0.0
    avg_domain = sum(r.domain_recall for r in results) / len(results) if results else 0.0
    return BenchmarkReport(
        total=len(results),
        passed=passed,
        avg_skill_recall=round(avg_skill, 3),
        avg_domain_recall=round(avg_domain, 3),
        results=results,
    )


def format_report(report: BenchmarkReport) -> str:
    lines = [
        "# git-mentor Skill Detection Benchmark",
        "",
        f"- Profiles: {report.total}",
        f"- Passed: {report.passed}/{report.total} ({report.pass_rate:.0%})",
        f"- Avg skill recall: {report.avg_skill_recall:.1%}",
        f"- Avg domain recall: {report.avg_domain_recall:.1%}",
        "",
        "## Results",
    ]
    for result in report.results:
        status = "PASS" if result.passed else "FAIL"
        lines.append(f"### [{status}] {result.profile_id}")
        lines.append(f"- Skill recall: {result.skill_recall:.1%}")
        lines.append(f"- Domain recall: {result.domain_recall:.1%}")
        if result.missing_skills:
            lines.append(f"- Missing skills: {', '.join(result.missing_skills)}")
        if result.missing_domains:
            lines.append(f"- Missing domains: {', '.join(result.missing_domains)}")
        lines.append("")
    return "\n".join(lines)
