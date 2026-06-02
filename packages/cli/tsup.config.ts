import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    mcp: "src/mcp.ts",
    eval: "src/eval.ts",
    "chat-cli": "src/chat-cli.tsx",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: false,
  shims: true,
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
  noExternal: [/^@git-mentor\//],
  external: [
    "@modelcontextprotocol/sdk",
    "@octokit/rest",
    "yaml",
    "zod",
    "chalk",
    "commander",
    "ink",
    "react",
    "react/jsx-runtime",
    "ink-text-input",
    "ink-spinner",
    "ink-select-input",
  ],
});
