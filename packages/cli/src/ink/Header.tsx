import React from "react";
import { Box, Text } from "ink";
import { colors, LOGO } from "../ui/colors.js";
import { TipsBox } from "./TipsBox.js";

export function Header(props: {
  username: string;
  roleId: string;
  provider: string;
  model: string;
  profileLoaded: boolean;
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
        {props.profileLoaded ? " · profile loaded" : " · profile not loaded"}
      </Text>
      <TipsBox>
        <Text>
          <Text color={colors.brand}>{"> "}</Text>
          /model · /gaps · /growth · /improve · /help
        </Text>
      </TipsBox>
    </Box>
  );
}
