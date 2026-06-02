# Role gap coaching (GitHub)

Turn gap analysis into a **GitHub-backed career plan** for the active target role.

## When to use

- User asks about fit, missing skills, career change, or promotion readiness.
- User runs `/gaps` or mentions a role (`ai-engineer`, `staff-engineer`, etc.).
- Opening message after `/analyze profile`.

## Workflow

1. State **target role** and **fit score** from profile data.
2. List **top 3 gaps** with `area`, current → target level, and **which repos (or lack thereof)** support the diagnosis.
3. Map each gap to a **GitHub-visible fix**:
   - Missing skill → repo to build or contribute to
   - Weak signal → README, tests, CI, or docs in an existing repo
   - Domain mismatch → pivot project or pin a better showcase repo
4. Pull one item from the **growth plan** as the recommended next action.
5. If fit score is unknown, tell user to run `/analyze profile`.

## Output format

```
Fit: X/10 for <role>
Gaps:
- <area>: <evidence from repos> → <GitHub action>
Next step: <single concrete action this week>
```

Never recommend skills that aren't reflected in role templates or gap analysis fields.
