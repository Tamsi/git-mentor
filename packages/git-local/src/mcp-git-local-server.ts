#!/usr/bin/env node
/**
 * Git-mentor local git MCP server — clone, pull, inspect under WORKSPACES_DIR.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { callGitLocalMcpTool, GIT_LOCAL_MCP_TOOL_DEFINITIONS } from "./mcp-handlers.js";

const server = new Server(
  { name: "git-mentor-git-local-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [...GIT_LOCAL_MCP_TOOL_DEFINITIONS],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const result = await callGitLocalMcpTool(
      request.params.name,
      (request.params.arguments ?? {}) as Record<string, unknown>,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: message }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
