import React from "react";
import { StartupPanel } from "./StartupPanel.js";

export function Header(props: {
  username: string;
  roleId: string;
  provider: string;
  model: string;
  profileLoaded: boolean;
  githubMcpEnabled: boolean;
  activeSkills: number;
  totalSkills: number;
}) {
  return <StartupPanel {...props} />;
}
