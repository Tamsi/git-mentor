import React, { useEffect, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import type { GitMentorConfig } from "@git-mentor/core";
import { markModelConfigured, saveConfig } from "@git-mentor/core";
import {
  getOllamaAuthStatus,
  listOllamaModelCatalog,
  modelLabel,
  ensureOllamaModel,
  isCloudCatalogName,
  signInToOllama,
} from "@git-mentor/llm";
import { colors } from "../ui/colors.js";
import {
  buildModelPickerItems,
  formatPickerLabel,
  SIGNIN_VALUE,
  type ModelPickerItem,
} from "../model-catalog.js";

export interface ModelPickerResult {
  changed: boolean;
  model?: string;
  message: string;
}

interface ModelSelectViewProps {
  config: GitMentorConfig;
  onDone: (result: ModelPickerResult) => void;
  /** When true (CLI `gitmentor model`), exit Ink after completion. */
  standalone?: boolean;
  /** First-run onboarding — selection is required and persisted as default. */
  firstRun?: boolean;
}

export function ModelSelectView({ config, onDone, standalone = false, firstRun = false }: ModelSelectViewProps) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<"loading" | "pick" | "signin" | "preparing">("loading");
  const [items, setItems] = useState<ModelPickerItem[]>([]);
  const [initialIndex, setInitialIndex] = useState(0);
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof listOllamaModelCatalog>> | null>(
    null,
  );
  const [signedIn, setSignedIn] = useState(false);
  const [signInStatus, setSignInStatus] = useState("");

  const finish = (result: ModelPickerResult) => {
    onDone(result);
    if (standalone) exit();
  };

  useInput((_input, key) => {
    if (phase === "pick" && key.escape && !firstRun) {
      finish({ changed: false, message: "Model selection cancelled." });
    }
  });

  useEffect(() => {
    if (config.llm.provider !== "ollama") {
      finish({
        changed: false,
        message: `Model picker is for Ollama only. Current: ${modelLabel(config)}`,
      });
      return;
    }

    void (async () => {
      const [loadedCatalog, auth] = await Promise.all([
        listOllamaModelCatalog(config.llm.baseUrl),
        getOllamaAuthStatus(),
      ]);
      const pickerItems = buildModelPickerItems(loadedCatalog, auth.signedIn);
      if (pickerItems.length === 0) {
        finish({ changed: false, message: "No Ollama models found. Is Ollama running?" });
        return;
      }

      setCatalog(loadedCatalog);
      setSignedIn(auth.signedIn);
      setItems(pickerItems);
      setInitialIndex(Math.max(0, pickerItems.findIndex((item) => item.value === config.llm.model)));
      setPhase("pick");
    })();
  }, [config]);

  const finishSignIn = async (): Promise<boolean> => {
    setPhase("signin");
    setSignInStatus("Opening browser for Ollama sign-in…");
    try {
      const result = await signInToOllama({
        onStatus: setSignInStatus,
      });
      setSignedIn(true);
      finish({
        changed: false,
        message: `Signed in to Ollama as ${result.username}. Run /model to pick a cloud model.`,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ollama sign-in failed.";
      finish({ changed: false, message });
      return false;
    }
  };

  const applyModel = async (selected: string) => {
    if (!catalog) return;

    if (selected === SIGNIN_VALUE) {
      await finishSignIn();
      return;
    }

    const isCloud = isCloudCatalogName(selected, catalog.cloud);
    if (isCloud && !signedIn) {
      setPhase("signin");
      setSignInStatus("Cloud model requires Ollama sign-in…");
      try {
        await signInToOllama({ onStatus: setSignInStatus });
        setSignedIn(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Ollama sign-in failed.";
        finish({ changed: false, message });
        return;
      }
    }

    config.llm.model = selected;
    markModelConfigured(config);
    saveConfig(config);

    setPhase("preparing");
    setSignInStatus(`Connecting ${selected}…`);
    const ready = await ensureOllamaModel(config.llm, setSignInStatus);
    config.llm.model = ready.model;
    markModelConfigured(config);
    saveConfig(config);

    finish({
      changed: true,
      model: ready.model,
      message: firstRun
        ? `Default model saved: ${modelLabel(config)}`
        : `Model set to ${modelLabel(config)}`,
    });
  };

  if (phase === "loading") {
    return (
      <Box>
        <Text color={colors.brand}>
          <Spinner type="dots" />
        </Text>
        <Text> Loading models…</Text>
      </Box>
    );
  }

  if (phase === "signin" || phase === "preparing") {
    return (
      <Box flexDirection="column">
        <Text color={colors.brand}>
          <Spinner type="dots" />
        </Text>
        <Text> {signInStatus}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold color={colors.brand}>
        {firstRun ? "Welcome — choose your default model" : "Select LLM model"}
      </Text>
      {firstRun ? (
        <Text color={colors.muted}>
          This model will be used every time you run gitmentor. Change later with /model.
        </Text>
      ) : (
        <Text color={colors.muted}>↑↓ navigate · Enter select · Esc cancel</Text>
      )}
      <Box marginTop={1}>
        <SelectInput
          initialIndex={initialIndex}
          items={items.map((item) => ({
            label: formatPickerLabel(item),
            value: item.value,
          }))}
          onSelect={(item) => {
            void applyModel(item.value);
          }}
        />
      </Box>
    </Box>
  );
}

export function SignInView({
  onDone,
  standalone = false,
}: {
  onDone: (result: ModelPickerResult) => void;
  standalone?: boolean;
}) {
  const { exit } = useApp();
  const [status, setStatus] = useState("Starting Ollama sign-in…");

  useEffect(() => {
    void (async () => {
      try {
        const result = await signInToOllama({ onStatus: setStatus });
        onDone({
          changed: false,
          message: `Signed in to Ollama as ${result.username}. Run /model to pick a cloud model.`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Ollama sign-in failed.";
        onDone({ changed: false, message });
      }
      if (standalone) exit();
    })();
  }, [exit, onDone, standalone]);

  return (
    <Box flexDirection="column">
      <Text bold color={colors.brand}>
        Ollama sign-in
      </Text>
      <Text color={colors.brand}>
        <Spinner type="dots" />
      </Text>
      <Text> {status}</Text>
    </Box>
  );
}

export async function runModelPickerInk(config: GitMentorConfig): Promise<ModelPickerResult> {
  const { render } = await import("ink");
  return new Promise((resolve) => {
    const { waitUntilExit } = render(
      <ModelSelectView config={config} standalone onDone={(result) => resolve(result)} />,
    );
    void waitUntilExit();
  });
}

export async function runOllamaSignInInk(): Promise<ModelPickerResult> {
  const { render } = await import("ink");
  return new Promise((resolve) => {
    const { waitUntilExit } = render(
      <SignInView standalone onDone={(result) => resolve(result)} />,
    );
    void waitUntilExit();
  });
}
