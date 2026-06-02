import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import type { ContextSnapshot } from "@git-mentor/chat";
import { formatContextBar } from "@git-mentor/chat";
import { colors } from "../ui/colors.js";

export function ChatFooter(props: {
  snapshot: ContextSnapshot;
  busy: boolean;
  progress: string | null;
  streaming: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (value: string) => void;
}) {
  const line = formatContextBar(props.snapshot);
  const warn = props.snapshot.contextPercent >= 80;

  return (
    <Box flexDirection="column" marginTop={1}>
      {props.busy && props.progress ? (
        <Box marginBottom={1}>
          <Text color={colors.brand}>
            <Spinner type="dots" />
          </Text>
          <Text color={colors.muted}> {props.progress}</Text>
        </Box>
      ) : null}

      {props.busy && !props.progress && !props.streaming ? (
        <Box marginBottom={1}>
          <Text color={colors.brand}>
            <Spinner type="dots" />
          </Text>
          <Text color={colors.muted}> Thinking…</Text>
        </Box>
      ) : null}

      {!props.busy ? (
        <Box marginBottom={0}>
          <Text color={colors.brand} bold>
            {"> "}
          </Text>
          <TextInput
            value={props.input}
            onChange={props.onInputChange}
            onSubmit={props.onSubmit}
            placeholder=""
          />
        </Box>
      ) : null}

      <Box width="100%" justifyContent="flex-end">
        <Text color={warn ? "yellow" : colors.muted}>{line}</Text>
      </Box>
    </Box>
  );
}
