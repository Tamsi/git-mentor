"""Tests for skill signals engine."""

from git_mentor.core.signals.engine import SkillSignalsEngine


def test_build_profile_from_signals():
    engine = SkillSignalsEngine()
    github_data = {
        "user": {
            "login": "demo-dev",
            "name": "Demo Dev",
            "bio": "Backend engineer",
            "public_repos": 3,
        },
        "repos": [
            {
                "name": "api-service",
                "html_url": "https://github.com/demo-dev/api-service",
                "description": "FastAPI backend",
                "language": "Python",
                "stargazers_count": 12,
                "topics": ["api", "fastapi"],
                "dependency_markers": ['"fastapi"', '"langgraph"'],
            },
            {
                "name": "symfony-app",
                "html_url": "https://github.com/demo-dev/symfony-app",
                "description": "Symfony project",
                "language": "PHP",
                "stargazers_count": 4,
                "topics": ["symfony"],
                "dependency_markers": ['"symfony/framework-bundle"'],
            },
        ],
    }
    signals = engine.extract(github_data)
    profile = engine.build_profile(signals)

    assert profile.username == "demo-dev"
    assert profile.repo_count == 2
    assert any(s.name == "Python" for s in profile.skills)
    assert profile.maturity_score > 0
