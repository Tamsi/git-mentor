import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadConfig } from "@git-mentor/core";
import { WELCOME_MESSAGE } from "./prompts.js";
import { stripAtUsername } from "./command-utils.js";
import { ChatSession } from "./session.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function htmlPage(): string {
  try {
    return readFileSync(path.join(__dirname, "ui", "index.html"), "utf8");
  } catch {
    return embeddedHtml();
  }
}

function embeddedHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>git-mentor</title>
  <style>
    :root { color-scheme: dark; --bg: #0d1117; --panel: #161b22; --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff; --user: #1f6feb22; --bot: #21262d; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: var(--bg); color: var(--text); height: 100vh; display: flex; flex-direction: column; }
    header { padding: 1rem 1.25rem; border-bottom: 1px solid #30363d; background: var(--panel); }
    header h1 { margin: 0; font-size: 1.1rem; }
    header p { margin: 0.25rem 0 0; color: var(--muted); font-size: 0.85rem; }
    #setup { padding: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap; border-bottom: 1px solid #30363d; }
    #setup input, #setup select, #setup button { font: inherit; padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid #30363d; background: var(--panel); color: var(--text); }
    #setup button { background: var(--accent); color: #000; border: none; cursor: pointer; font-weight: 600; }
    #messages { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
    .msg { max-width: 85%; padding: 0.75rem 1rem; border-radius: 12px; line-height: 1.5; white-space: pre-wrap; font-size: 0.95rem; }
    .msg.user { align-self: flex-end; background: var(--user); border: 1px solid #388bfd66; }
    .msg.bot { align-self: flex-start; background: var(--bot); border: 1px solid #30363d; }
    #composer { display: flex; gap: 0.5rem; padding: 1rem; border-top: 1px solid #30363d; background: var(--panel); }
    #input { flex: 1; resize: none; min-height: 44px; max-height: 160px; padding: 0.75rem; border-radius: 10px; border: 1px solid #30363d; background: var(--bg); color: var(--text); font: inherit; }
    #send { padding: 0 1rem; border: none; border-radius: 10px; background: var(--accent); color: #000; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <header>
    <h1>git-mentor</h1>
    <p>Evidence-backed GitHub career coach — local chat</p>
  </header>
  <div id="setup">
    <input id="username" placeholder="GitHub username (octocat)" value="octocat" />
    <select id="role">
      <option value="ai-engineer">AI Engineer</option>
      <option value="staff-engineer">Staff Engineer</option>
      <option value="full-stack">Full Stack</option>
      <option value="software-architect">Software Architect</option>
      <option value="oss-maintainer">OSS Maintainer</option>
    </select>
    <button id="start">Start session</button>
  </div>
  <div id="messages"></div>
  <div id="composer" style="display:none">
    <textarea id="input" rows="1" placeholder="Ask about your profile, gaps, or growth plan…"></textarea>
    <button id="send">Send</button>
  </div>
  <script>
    const messages = document.getElementById('messages');
    const composer = document.getElementById('composer');
    const input = document.getElementById('input');
    let sessionId = null;

    function addMsg(text, role) {
      const el = document.createElement('div');
      el.className = 'msg ' + role;
      el.textContent = text;
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
    }

    document.getElementById('start').onclick = async () => {
      const username = document.getElementById('username').value.trim();
      const role = document.getElementById('role').value;
      document.getElementById('setup').style.display = 'none';
      composer.style.display = 'flex';
      addMsg('Starting session…', 'bot');
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, roleId: role }),
      });
      const data = await res.json();
      sessionId = data.sessionId;
      messages.lastChild.textContent = data.welcome + '\\n\\n' + data.bootstrap;
    };

    async function send() {
      const text = input.value.trim();
      if (!text || !sessionId) return;
      addMsg(text, 'user');
      input.value = '';
      const bot = document.createElement('div');
      bot.className = 'msg bot';
      bot.textContent = '…';
      messages.appendChild(bot);
      messages.scrollTop = messages.scrollHeight;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text, stream: true }),
      });

      if (res.headers.get('content-type')?.includes('text/event-stream')) {
        bot.textContent = '';
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of decoder.decode(value).split('\\n')) {
            if (line.startsWith('data: ')) {
              const payload = JSON.parse(line.slice(6));
              if (payload.token) bot.textContent += payload.token;
            }
          }
        }
      } else {
        const data = await res.json();
        bot.textContent = data.content;
      }
      messages.scrollTop = messages.scrollHeight;
    }

    document.getElementById('send').onclick = send;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
  </script>
</body>
</html>`;
}

const sessions = new Map<string, ChatSession>();

export function createChatServer(port = 3847) {
  const config = loadConfig();

  const server = createServer(async (req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(htmlPage());
      return;
    }

    if (req.url === "/api/session" && req.method === "POST") {
      const body = await readBody(req);
      const { username, roleId } = JSON.parse(body) as { username: string; roleId?: string };
      const session = new ChatSession(config, stripAtUsername(username), roleId);
      const bootstrap = await session.bootstrap();
      const id = crypto.randomUUID();
      sessions.set(id, session);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          sessionId: id,
          welcome: WELCOME_MESSAGE,
          bootstrap: bootstrap.content,
        }),
      );
      return;
    }

    if (req.url === "/api/chat" && req.method === "POST") {
      const body = await readBody(req);
      const { sessionId, message, stream } = JSON.parse(body) as {
        sessionId: string;
        message: string;
        stream?: boolean;
      };
      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session not found" }));
        return;
      }

      if (stream && config.llm.provider !== "deterministic") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        for await (const chunk of session.handleInputStream(message)) {
          if (chunk.type === "token" && chunk.content) {
            res.write(`data: ${JSON.stringify({ token: chunk.content })}\n\n`);
          }
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        return;
      }

      const reply = await session.handleInput(message);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(reply));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  return { server, port, start: () => server.listen(port) };
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export { ChatSession, WELCOME_MESSAGE };
