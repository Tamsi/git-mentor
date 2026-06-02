"""Eval benchmark tests."""

from git_mentor.eval.benchmark import run_benchmark


def test_benchmark_runs():
    report = run_benchmark()
    assert report.total >= 3
    assert report.pass_rate >= 0.5
