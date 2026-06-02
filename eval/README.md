# git-mentor Evaluation

Benchmarks skill detection against synthetic profiles with ground-truth labels.

## Run locally

```bash
git-mentor eval
git-mentor eval --json
git-mentor eval --output eval/results/latest.md
```

## Dataset

`datasets/synthetic_profiles.json` lives in `src/git_mentor/eval/datasets/` (shipped with the package).

Publish to Hugging Face:

```bash
huggingface-cli upload git-mentor/dev-profiles-eval src/git_mentor/eval/datasets/synthetic_profiles.json --repo-type dataset
```

## Metrics

| Metric | Target (MVP) |
|--------|----------------|
| Skill recall | ≥ 75% per profile |
| Domain recall | ≥ 50% per profile |
| Pass rate | ≥ 80% overall |
