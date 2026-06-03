import { describe, expect, it } from "vitest";
import { parseLoginTargetArg, parseSlashLoginCommand } from "./login-target.js";

describe("parseLoginTargetArg", () => {
  it("defaults to both", () => {
    expect(parseLoginTargetArg()).toBe("both");
    expect(parseLoginTargetArg("")).toBe("both");
  });

  it("parses gh and ollama", () => {
    expect(parseLoginTargetArg("gh")).toBe("gh");
    expect(parseLoginTargetArg("github")).toBe("gh");
    expect(parseLoginTargetArg("ollama")).toBe("ollama");
  });

  it("rejects unknown targets", () => {
    expect(parseLoginTargetArg("azure")).toBeNull();
  });
});

describe("parseSlashLoginCommand", () => {
  it("parses /login variants", () => {
    expect(parseSlashLoginCommand("/login")).toBe("both");
    expect(parseSlashLoginCommand("/login gh")).toBe("gh");
    expect(parseSlashLoginCommand("/login ollama")).toBe("ollama");
  });

  it("maps /signin to ollama", () => {
    expect(parseSlashLoginCommand("/signin")).toBe("ollama");
    expect(parseSlashLoginCommand("/model signin")).toBe("ollama");
  });

  it("returns invalid for bad args", () => {
    expect(parseSlashLoginCommand("/login azure")).toBe("invalid");
    expect(parseSlashLoginCommand("/signin extra")).toBe("invalid");
  });
});
