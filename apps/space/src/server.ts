import { createServer } from "node:http";
import { AnalysisPipeline } from "@git-mentor/agents";
import { listRoles, loadConfig, renderMarkdown } from "@git-mentor/core";

const config = loadConfig();
config.llm.provider = process.env.GIT_MENTOR_LLM_PROVIDER ?? "deterministic";
const pipeline = new AnalysisPipeline(config);
const port = Number(process.env.PORT ?? 7860);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>git-mentor demo</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; }
    input, select, button { font: inherit; padding: 0.5rem; margin-right: 0.5rem; }
    pre { background: #111; color: #eee; padding: 1rem; overflow: auto; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>git-mentor</h1>
  <p>Evidence-backed GitHub career intelligence — public profiles only.</p>
  <label>Username <input id="username" placeholder="octocat" /></label>
  <label>Role <select id="role">${listRoles().map((r) => `<option value="${r.id}">${r.name}</option>`).join("")}</select></label>
  <button id="run">Analyze</button>
  <h2>Technical Dossier</h2>
  <pre id="out">Enter a public GitHub username.</pre>
  <script>
    document.getElementById('run').onclick = async () => {
      const username = document.getElementById('username').value.trim();
      const role = document.getElementById('role').value;
      const out = document.getElementById('out');
      out.textContent = 'Analyzing...';
      const res = await fetch('/api/analyze?username=' + encodeURIComponent(username) + '&role=' + encodeURIComponent(role));
      const data = await res.json();
      out.textContent = data.error ? data.error : data.markdown;
    };
  </script>
</body>
</html>`;

createServer(async (req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
    return;
  }

  if (req.url?.startsWith("/api/analyze")) {
    const url = new URL(req.url, "http://localhost");
    const username = url.searchParams.get("username")?.replace(/^@/, "");
    const role = url.searchParams.get("role") ?? "ai-engineer";
    if (!username) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "username required" }));
      return;
    }
    try {
      const result = await pipeline.run({ username, roleId: role, repoLimit: 15 });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ markdown: renderMarkdown(result), traces: result.traces }));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Analysis failed" }));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
}).listen(port, () => console.log(`git-mentor space listening on http://localhost:${port}`));
