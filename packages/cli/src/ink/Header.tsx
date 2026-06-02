import React from "react";
import { Box, Text } from "ink";
import { colors, LOGO } from "../ui/colors.js";
import { TipsBox } from "./TipsBox.js";

export function Header(props: {
  username: string;
  roleId: string;
  provider: string;
  model: string;
}) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {LOGO.map((line) => (
        <Text key={line} color={colors.brand}>
          {line}
        </Text>
      ))}
      <Text color={colors.muted}>
        {" "}
        @{props.username} · {props.roleId} · {props.provider}/{props.model}
      </Text>
      <TipsBox>
        <Text>
          <Text color={colors.brand}>{"> "}</Text>
          /model · /model signin · /analyze profile · /help
        </Text>
      </TipsBox>
    </Box>
  );
}
