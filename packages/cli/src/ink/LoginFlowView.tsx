import React, { useEffect, useRef, useState } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { LoginTarget } from "@git-mentor/core";
import { runGhAuthInteractive, syncGitHubMcpInConfig } from "@git-mentor/github";
import { loadConfig, saveConfig } from "@git-mentor/core";
import { signInToOllama } from "@git-mentor/llm";
import { colors } from "../ui/colors.js";

export interface LoginFlowResult {
  ok: boolean;
  message: string;
}

type FlowStep = "github" | "ollama" | "finished";

function stepLabel(target: LoginTarget, step: FlowStep): string {
  if (target === "gh") return "GitHub sign-in";
  if (target === "ollama") return "Ollama cloud sign-in";
  if (step === "github") return "Step 1/2 — GitHub sign-in";
  if (step === "ollama") return "Step 2/2 — Ollama cloud sign-in";
  return "Done";
}

export function LoginFlowView({
  target,
  onDone,
  onGitHubComplete,
}: {
  target: LoginTarget;
  onDone: (result: LoginFlowResult) => void;
  onGitHubComplete?: () => Promise<string | void>;
}) {
  const needsGh = target === "gh" || target === "both";
  const needsOllama = target === "ollama" || target === "both";
  const [step, setStep] = useState<FlowStep>(needsGh ? "github" : "ollama");
  const [status, setStatus] = useState("");
  const priorLinesRef = useRef<string[]>([]);

  const onDoneRef = useRef(onDone);
  const onGitHubCompleteRef = useRef(onGitHubComplete);
  onDoneRef.current = onDone;
  onGitHubCompleteRef.current = onGitHubComplete;

  const ghStartedRef = useRef(false);
  const ollamaStartedRef = useRef(false);

  useEffect(() => {
    if (step !== "github" || !needsGh || ghStartedRef.current) return;
    ghStartedRef.current = true;
    setStatus("Opening GitHub device login…");

    void (async () => {
      const config = loadConfig();
      try {
        await runGhAuthInteractive("login", { onStatus: setStatus, piped: true });
        if (syncGitHubMcpInConfig(config)) saveConfig(config);
        const ghLine = "GitHub sign-in complete.";
        const extra = onGitHubCompleteRef.current
          ? await onGitHubCompleteRef.current()
          : undefined;
        const collected = [ghLine, extra?.replace(/\*\*/g, "")].filter(Boolean) as string[];
        priorLinesRef.current = collected;
        if (needsOllama) {
          setStep("ollama");
          setStatus("Starting Ollama sign-in…");
        } else {
          setStep("finished");
          onDoneRef.current({ ok: true, message: collected.join("\n\n") });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "GitHub sign-in failed.";
        setStep("finished");
        onDoneRef.current({ ok: false, message });
      }
    })();
  }, [step, needsGh, needsOllama]);

  useEffect(() => {
    if (step !== "ollama" || !needsOllama || ollamaStartedRef.current) return;
    ollamaStartedRef.current = true;
    setStatus("Opening browser for Ollama sign-in…");

    void (async () => {
      try {
        const result = await signInToOllama({ onStatus: setStatus });
        const ollamaLine = `Ollama sign-in complete (${result.username}).`;
        const all = [...priorLinesRef.current, ollamaLine];
        setStep("finished");
        onDoneRef.current({ ok: true, message: all.join("\n\n") });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Ollama sign-in failed.";
        const failed = message.toLowerCase().includes("failed") || message.toLowerCase().includes("timed out");
        setStep("finished");
        onDoneRef.current({
          ok: !failed && priorLinesRef.current.length > 0,
          message: [...priorLinesRef.current, message].filter(Boolean).join("\n\n"),
        });
      }
    })();
  }, [step, needsOllama]);

  if (step === "finished") {
    return null;
  }

  return (
    <Box flexDirection="column">
      <Text bold color={colors.brand}>
        gitmentor login — {stepLabel(target, step)}
      </Text>
      <Text color={colors.brand}>
        <Spinner type="dots" />
      </Text>
      <Text> {status}</Text>
      {step === "github" ? (
        <Text color={colors.muted}>Enter the code on github.com/login/device, then Continue.</Text>
      ) : (
        <Text color={colors.muted}>Complete login in your browser when it opens.</Text>
      )}
    </Box>
  );
}

export async function runLoginFlowInk(
  target: LoginTarget,
  options?: { onGitHubComplete?: () => Promise<string | void> },
): Promise<LoginFlowResult> {
  const { render } = await import("ink");
  return new Promise((resolve) => {
    const app = render(
      <LoginFlowView
        target={target}
        onGitHubComplete={options?.onGitHubComplete}
        onDone={(result) => {
          app.unmount();
          resolve(result);
        }}
      />,
    );
  });
}
