import React from "react";
import { Box, Text } from "ink";
import { colors } from "../ui/colors.js";
import { RichText } from "./RichText.js";

export type ChatMessageRole = "user" | "assistant";

const USER_BG = "#21262d";

export function ChatMessageView(props: { role: ChatMessageRole; content: string }) {
  if (props.role === "user") {
    return (
      <Box marginBottom={1} backgroundColor={USER_BG} paddingX={1}>
        <Text wrap="wrap">
          <Text color={colors.brand} bold>
            {"> "}
          </Text>
          {props.content}
        </Text>
      </Box>
    );
  }

  return (
    <Box marginBottom={1} marginLeft={2} paddingLeft={1}>
      <RichText text={props.content} />
    </Box>
  );
}
