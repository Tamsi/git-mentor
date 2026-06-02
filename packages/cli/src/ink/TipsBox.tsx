import React from "react";
import { Box, Text } from "ink";
import { colors } from "../ui/colors.js";

export function TipsBox({ children }: { children: React.ReactNode }) {
  return (
    <Box
      borderStyle="round"
      borderColor={colors.border}
      paddingX={1}
      marginY={1}
      flexDirection="column"
    >
      <Text>{children}</Text>
    </Box>
  );
}
