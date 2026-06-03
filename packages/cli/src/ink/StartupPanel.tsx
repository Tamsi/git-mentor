import React from "react";
import { Box, Text, useStdout } from "ink";
import { GITHUB_MCP_SERVER_NAME, GITHUB_MCP_SHIPPED_TOOLS } from "@git-mentor/github";
import { colors } from "../ui/colors.js";
import { LOGO, LOGO_TAGLINE, LOGO_WIDTH } from "../ui/logo.js";
import { GITMENTOR_VERSION, SLASH_COMMAND_GROUPS } from "../ui/banner.js";
import { TipsBox } from "./TipsBox.js";

export function StartupPanel(props: {
  username: string;
  roleId: string;
  provider: string;
  model: string;
  profileLoaded: boolean;
  githubMcpEnabled: boolean;
  activeSkills: number;
  totalSkills: number;
}) {
  const { columns } = useStdout();
  const wide = columns >= LOGO_WIDTH + 24;

  const profileLabel = props.profileLoaded
    ? { text: "profile loaded", color: colors.success as string }
    : { text: "run /analyze profile", color: colors.muted };

  const mcpLabel = props.githubMcpEnabled
    ? `${GITHUB_MCP_SERVER_NAME} · ${GITHUB_MCP_SHIPPED_TOOLS.length} tools`
    : `${GITHUB_MCP_SERVER_NAME} off · /login gh`;

  if (!wide) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        {LOGO.map((line) => (
          <Text key={line} color={colors.brand}>
            {line}
          </Text>
        ))}
        <Text color={colors.muted}>{LOGO_TAGLINE}</Text>
        <Text color={colors.muted}>
          v{GITMENTOR_VERSION} · @{props.username} · {props.roleId}
        </Text>
        <Text color={colors.muted}>
          {props.provider}/{props.model} ·{" "}
          <Text color={profileLabel.color}>{profileLabel.text}</Text>
        </Text>
        <TipsBox>
          <Text>
            <Text color={colors.brand}>{"> "}</Text>
            /followers · /discussions · /analyze profile · /help
          </Text>
        </TipsBox>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      {LOGO.map((line) => (
        <Text key={line} color={colors.brand}>
          {line}
        </Text>
      ))}
      <Text color={colors.muted}>{LOGO_TAGLINE}</Text>

      <Box
        borderStyle="round"
        borderColor={colors.border}
        paddingX={1}
        marginTop={1}
        flexDirection="row"
      >
        <Box flexDirection="column" width="48%" paddingRight={1}>
          <Text color={colors.brand} bold>
            v{GITMENTOR_VERSION}
          </Text>
          <Text> </Text>
          <Text>
            <Text color={colors.brand}>@</Text>
            <Text bold>{props.username}</Text>
            <Text color={colors.muted}> · {props.roleId}</Text>
          </Text>
          <Text color={colors.muted}>
            {props.provider}/{props.model}
          </Text>
          <Text color={profileLabel.color}>{profileLabel.text}</Text>
          <Text color={colors.muted}>{mcpLabel}</Text>
          <Text color={colors.muted}>
            Skills {props.activeSkills}/{props.totalSkills} active
          </Text>
        </Box>

        <Box flexDirection="column" width="52%" paddingLeft={1}>
          <Text color={colors.brand} bold>
            In chat
          </Text>
          {SLASH_COMMAND_GROUPS.map((group) => (
            <Text key={group.label} wrap="wrap">
              <Text color={colors.muted}>{group.label}: </Text>
              <Text>{group.commands.join(" · ")}</Text>
            </Text>
          ))}
          <Text> </Text>
          <Text color={colors.muted}>/help · Esc to quit · /export dossier</Text>
        </Box>
      </Box>
    </Box>
  );
}
