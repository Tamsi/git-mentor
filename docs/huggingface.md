# Hugging Face Deployment

## Overview

| Asset | HF slug (suggested) | Source |
|-------|---------------------|--------|
| Space (demo) | `git-mentor/demo` | `space/` |
| Dataset (eval) | `git-mentor/dev-profiles-eval` | `src/git_mentor/eval/datasets/` |

## Deploy the Space

### Option A — HF Git (recommended)

1. Create a Gradio Space at https://huggingface.co/new-space
2. Clone the Space repo:

```bash
git clone https://huggingface.co/spaces/YOUR_USER/git-mentor-demo
cd git-mentor-demo
```

3. Copy files:

```bash
cp -r ../git-mentor/space/* .
cp -r ../git-mentor/src ./src
```

4. Update `space/requirements.txt` to install from local path or publish package to PyPI.

5. Push:

```bash
git add . && git commit -m "Deploy git-mentor demo" && git push
```

### Option B — Monorepo subfolder (Docker)

Use a root `Dockerfile` in `space/` if HF needs the full monorepo context.

### Space secrets

| Secret | Required | Purpose |
|--------|----------|---------|
| `GIT_MENTOR_GITHUB_TOKEN` | Optional | Higher GitHub API rate limits |
| `GIT_MENTOR_LLM_API_KEY` | Optional | Remote LLM in Space |

Default demo uses **deterministic mode** (no secrets required).

## Publish the eval dataset

```bash
pip install huggingface_hub
huggingface-cli login
huggingface-cli repo create dev-profiles-eval --type dataset --org git-mentor
huggingface-cli upload git-mentor/dev-profiles-eval src/git_mentor/eval/datasets/synthetic_profiles.json --repo-type dataset
```

Add a dataset README on HF describing fields and metrics.

## Link from GitHub

Add to your GitHub repo About section and README badge:

```markdown
[![HF Space](https://img.shields.io/badge/🤗-Space-yellow)](https://huggingface.co/spaces/YOUR_USER/git-mentor-demo)
```
