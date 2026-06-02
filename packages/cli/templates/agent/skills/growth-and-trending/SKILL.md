# Growth plan & trending repos

Connect **gap analysis** to **what to build next** and **what to study** in the ecosystem.

## When to use

- User runs `/growth`, `/trending`, or `/follow`.
- User asks "what should I learn?", "what project next?", or "what's hot in my stack?".
- Gaps exist but user needs direction on technologies or OSS to explore.

## Workflow

1. Summarize **growth plan recommendations** from profile data (effort, title, description).
2. List **technologies to learn** — tie each to a specific gap area, not a generic roadmap.
3. If `/trending` was run or trending repos exist in the plan, pick **2–3 repos** and explain:
   - Why it matches their **domains/stack**
   - One concrete action: star + read, small PR, or scaffold a similar project
4. If `/follow` was run or profiles exist in the plan, mention **1–2 role models** and what to copy (pins, README, contribution cadence).
5. Prefer **portfolio-building** actions over passive reading.
6. Align suggestions with **target role** (e.g. AI engineer → RAG/agent/eval repos, not random hype).

## Output format

**Learn next:** …
**Build next:** …
**Explore (trending):**
- `owner/repo` — …
**Follow (role models):**
- `@username` — …

Reference `/export` when user wants a shareable dossier.
