import { describe, expect, it, vi, afterEach } from "vitest";
import { runOllamaToolChat } from "./ollama-tools.js";

describe("runOllamaToolChat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("executes tools then returns final assistant text", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return new Response(
          JSON.stringify({
            message: {
              role: "assistant",
              tool_calls: [
                {
                  function: {
                    name: "update_user_profile",
                    arguments: { bio: "hello" },
                  },
                },
              ],
            },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          message: { role: "assistant", content: "Bio updated on GitHub." },
        }),
        { status: 200 },
      );
    }));

    const executed: string[] = [];
    const result = await runOllamaToolChat({
      baseUrl: "http://localhost:11434",
      model: "deepseek-v4-flash:cloud",
      temperature: 0.2,
      messages: [{ role: "user", content: "update my bio to hello" }],
      tools: [
        {
          type: "function",
          function: {
            name: "update_user_profile",
            description: "Update bio",
            parameters: { type: "object", properties: { bio: { type: "string" } } },
          },
        },
      ],
      executeTool: async (name) => {
        executed.push(name);
        return '{"ok":true}';
      },
    });

    expect(executed).toEqual(["update_user_profile"]);
    expect(result.content).toContain("Bio updated");
  });
});
