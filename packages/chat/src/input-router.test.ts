import { describe, expect, it } from "vitest";
import { routeInput } from "./input-router.js";

describe("routeInput", () => {
  it("routes slash commands", () => {
    expect(routeInput("/help", { hasProfile: true })).toEqual({
      kind: "command",
      command: "/help",
    });
  });

  it("routes natural language to chat when profile is loaded", () => {
    expect(routeInput("edit my description", { hasProfile: true })).toEqual({
      kind: "chat",
      message: "edit my description",
    });
  });

  it("requires analysis when profile is missing", () => {
    expect(routeInput("hello", { hasProfile: false }).kind).toBe("need-analysis");
  });
});
