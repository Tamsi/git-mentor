import React, { useEffect, useState } from "react";
import { Box, Text, useApp } from "ink";
import Spinner from "ink-spinner";
import { runGhAuthInteractive } from "@git-mentor/github";
import { colors } from "../ui/colors.js";

export function GitHubAuthView({
  action,
  onDone,
  standalone = false,
}: {
  action: "login" | "refresh";
  onDone: (result: { ok: boolean; message: string }) => void;
  standalone?: boolean;
}) {
  const { exit } = useApp();
  const [status, setStatus] = useState(
    action === "login" ? "Starting GitHub sign-in…" : "Refreshing GitHub token…",
  );

  useEffect(() => {
    void (async () => {
      try {
        await runGhAuthInteractive(action, { onStatus: setStatus });
        onDone({
          ok: true,
          message:
            action === "login"
              ? "GitHub sign-in finished. Run `/auth` to verify scopes."
              : "GitHub scopes updated. You can retry `/follow apply`.",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "GitHub auth failed.";
        onDone({ ok: false, message });
      }
      if (standalone) exit();
    })();
  }, [action, exit, onDone, standalone]);

  return (
    <Box flexDirection="column">
      <Text bold color={colors.brand}>
        {action === "login" ? "GitHub sign-in" : "GitHub scope refresh"}
      </Text>
      <Text color={colors.brand}>
        <Spinner type="dots" />
      </Text>
      <Text> {status}</Text>
      <Text color={colors.muted}>Complete the flow in your browser if prompted.</Text>
    </Box>
  );
}

export async function runGitHubAuthInk(action: "login" | "refresh"): Promise<{ ok: boolean; message: string }> {
  const { render } = await import("ink");
  return new Promise((resolve) => {
    const { waitUntilExit } = render(
      <GitHubAuthView action={action} standalone onDone={(result) => resolve(result)} />,
    );
    void waitUntilExit();
  });
}
