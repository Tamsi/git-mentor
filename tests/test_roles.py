"""Tests for role templates."""

from git_mentor.core.profiles.roles import get_role, list_roles


def test_list_roles():
    roles = list_roles()
    assert len(roles) >= 5


def test_get_role():
    role = get_role("ai-engineer")
    assert role.id == "ai-engineer"
    assert "Python" in role.required_skills
