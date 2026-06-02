import React from "react";
import { render } from "ink";
import { loadConfig } from "@git-mentor/core";
import { ChatApp } from "./ink/ChatApp.js";

export async function runChatCli(options: {
  username: string;
  roleId?: string;
  deterministic?: boolean;
}): Promise<void> {
  const username = options.username.replace(/^@/, "");
  const { waitUntilExit } = render(
    <ChatApp
      username={username}
      roleId={options.roleId ?? loadConfig().defaultRole}
      deterministic={options.deterministic}
    />,
  );
  await waitUntilExit();
}
