import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, useApp, useInput } from "ink";
import { ChatSession, type ContextSnapshot } from "@git-mentor/chat";
import { loadConfig, markModelConfigured, needsModelOnboarding } from "@git-mentor/core";
import { ChatFooter } from "./ChatFooter.js";
import { ChatMessageView, type ChatMessageRole } from "./ChatMessageView.js";
import { Header } from "./Header.js";
import { ModelSelectView, SignInView, type ModelPickerResult } from "./ModelSelectView.js";
import { RichText } from "./RichText.js";

type View = "chat" | "model-select" | "signin" | "model-onboarding";

interface ChatMessage {
  id: string;
  content: string;
  role: ChatMessageRole;
}

function isInteractiveModelCommand(line: string): boolean {
  const parts = line.trim().slice(1).split(/\s+/);
  if (parts[0]?.toLowerCase() !== "model") return false;
  const sub = parts[1]?.toLowerCase();
  if (!sub) return true;
  return sub === "pick" || sub === "list";
}

function isModelSignInCommand(line: string): boolean {
  const parts = line.trim().slice(1).split(/\s+/);
  return parts[0]?.toLowerCase() === "model" && parts[1]?.toLowerCase() === "signin";
}

function needsProgress(line: string): boolean {
  if (line.startsWith("/trending")) return true;
  if (!line.startsWith("/analyze")) return false;
  const parts = line.slice(1).trim().split(/\s+/);
  if (parts[0]?.toLowerCase() !== "analyze") return false;
  const sub = parts[1]?.toLowerCase();
  return Boolean(sub && sub !== "help");
}

export function ChatApp(props: {
  username: string;
  roleId: string;
  deterministic?: boolean;
}) {
  const { exit } = useApp();
  const config = useMemo(() => {
    const loaded = loadConfig();
    if (props.deterministic) {
      loaded.llm.provider = "deterministic";
      markModelConfigured(loaded);
    }
    return loaded;
  }, [props.deterministic]);

  const [session] = useState(() => new ChatSession(config, props.username, props.roleId));
  const [modelConfigured, setModelConfigured] = useState(
    () => props.deterministic || config.llm.modelConfigured,
  );
  const [view, setView] = useState<View>(() =>
    !props.deterministic && needsModelOnboarding(config) ? "model-onboarding" : "chat",
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [llmInfo, setLlmInfo] = useState({
    provider: config.llm.provider,
    model: config.llm.model,
  });
  const [contextStats, setContextStats] = useState<ContextSnapshot>(() => session.getContextSnapshot());

  const refreshContextStats = useCallback(() => {
    setContextStats(session.getContextSnapshot());
  }, [session]);

  useInput((_input, key) => {
    if (view !== "chat" || busy) return;
    if (key.escape && input === "") {
      exit();
    }
  });

  const startBootstrap = useCallback(() => {
    setBusy(true);
    void session
      .bootstrap((message) => setProgress(message.replace(/\*\*/g, "")))
      .then((reply) => {
        setMessages([{ id: "bootstrap", content: reply.content, role: "assistant" }]);
        refreshContextStats();
      })
      .finally(() => {
        setBusy(false);
        setProgress(null);
      });
    void session.ensureLlmReady().then(() => {
      const next = session.getConfig().llm;
      setLlmInfo({ provider: next.provider, model: next.model });
      refreshContextStats();
    });
  }, [session, refreshContextStats]);

  useEffect(() => {
    if (!modelConfigured) return;
    startBootstrap();
  }, [modelConfigured, startBootstrap]);

  const handleOnboardingDone = useCallback(
    (result: ModelPickerResult) => {
      const next = session.getConfig().llm;
      if (result.changed && result.model) {
        session.setModel(result.model);
      }
      markModelConfigured(session.getConfig());
      setLlmInfo({ provider: next.provider, model: session.getConfig().llm.model });
      setModelConfigured(true);
      setView("chat");
    },
    [session],
  );

  const appendMessage = useCallback((content: string, role: ChatMessageRole) => {
    if (!content || content === "__EXIT__") return;
    setMessages((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, content, role }]);
  }, []);

  const handlePickerDone = useCallback(
    (result: ModelPickerResult) => {
      setView("chat");
      if (result.changed && result.model) {
        session.setModel(result.model);
        const next = session.getConfig().llm;
        setLlmInfo({ provider: next.provider, model: next.model });
      }
      appendMessage(result.message.replace(/\*\*/g, ""), "assistant");
      refreshContextStats();
    },
    [appendMessage, refreshContextStats, session],
  );

  const submitLine = useCallback(
    async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || busy) return;

      setInput("");

      if (isInteractiveModelCommand(trimmed)) {
        appendMessage(trimmed, "user");
        setView("model-select");
        return;
      }

      if (isModelSignInCommand(trimmed)) {
        appendMessage(trimmed, "user");
        setView("signin");
        return;
      }

      appendMessage(trimmed, "user");

      setBusy(true);
      setProgress(null);
      setStreaming(null);

      const onProgress = needsProgress(trimmed)
        ? (message: string) => setProgress(message.replace(/\*\*/g, ""))
        : undefined;
      const useStream =
        session.getConfig().llm.provider !== "deterministic" && !trimmed.startsWith("/");

      try {
        if (!useStream) {
          const reply = await session.handleInput(trimmed, onProgress);
          if (reply.content === "__EXIT__") {
            exit();
            return;
          }
          appendMessage(reply.content, "assistant");
          refreshContextStats();
          return;
        }

        let full = "";
        for await (const chunk of session.handleInputStream(trimmed, onProgress)) {
          if (chunk.type === "token" && chunk.content) {
            full += chunk.content;
            setStreaming(full);
          }
          if (chunk.type === "done") {
            full = chunk.content || full;
          }
        }
        setStreaming(null);
        appendMessage(full, "assistant");
        refreshContextStats();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Something went wrong.";
        appendMessage(`Error: ${message}`, "assistant");
      } finally {
        setBusy(false);
        setProgress(null);
        refreshContextStats();
      }
    },
    [appendMessage, busy, exit, refreshContextStats, session],
  );

  if (view === "model-onboarding") {
    return (
      <ModelSelectView
        config={session.getConfig()}
        firstRun
        onDone={handleOnboardingDone}
      />
    );
  }

  if (view === "model-select") {
    return <ModelSelectView config={session.getConfig()} onDone={handlePickerDone} />;
  }

  if (view === "signin") {
    return <SignInView onDone={handlePickerDone} />;
  }

  const llm = session.getConfig().llm;

  return (
    <Box flexDirection="column" width="100%">
      <Header
        username={props.username}
        roleId={props.roleId}
        provider={llmInfo.provider || llm.provider}
        model={llmInfo.model || llm.model}
        profileLoaded={contextStats.profileLoaded}
      />

      <Box flexDirection="column" marginBottom={1} flexGrow={1}>
        {messages.map((message) => (
          <ChatMessageView key={message.id} role={message.role} content={message.content} />
        ))}
        {streaming ? (
          <Box marginBottom={1} marginLeft={2} paddingLeft={1}>
            <RichText text={streaming} />
          </Box>
        ) : null}
      </Box>

      <ChatFooter
        snapshot={contextStats}
        busy={busy}
        progress={progress}
        streaming={Boolean(streaming)}
        input={input}
        onInputChange={setInput}
        onSubmit={submitLine}
      />
    </Box>
  );
}
