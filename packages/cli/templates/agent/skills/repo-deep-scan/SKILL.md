# Repository deep scan

Interpret **`/analyze <repo>`** results: manifests, dependencies, and stack signals — not just GitHub metadata.

## When to use

- User ran `/analyze owner/repo` or asks about a specific project.
- User wants to know if a repo supports their target role narrative.
- Comparing portfolio repos for interview or pin selection.

## Workflow

1. Confirm the repo appears under **REPOSITORY DEEP ANALYSES** — if not, tell user to run `/analyze <repo>` first.
2. Summarize **purpose** from repo name, description, and detected manifests (`package.json`, `pyproject.toml`, etc.).
3. List **stack signals** and **notable dependencies** (frameworks, AI libs, infra tools).
4. Rate **role relevance** for the active target role: strong / partial / weak — with one sentence why.
5. Suggest **one repo-level improvement** grounded in what was found (missing CI, no tests dir, stale deps, thin README).

## Output format

**`owner/repo`** — one-line purpose

Stack: …
Role fit (<role>): strong | partial | weak — …
Improve: …

Do not infer source code quality beyond manifest/signal data. Do not claim files that weren't scanned.
