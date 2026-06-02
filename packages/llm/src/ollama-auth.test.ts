import { describe, expect, it } from "vitest";
import { parseOllamaSignInOutput } from "./ollama-auth.js";

describe("parseOllamaSignInOutput", () => {
  it("detects signed-in user", () => {
    const status = parseOllamaSignInOutput("You are already signed in as user 'tamsibesson'\n");
    expect(status.signedIn).toBe(true);
    expect(status.username).toBe("tamsibesson");
  });

  it("extracts connect URL when not signed in", () => {
    const status = parseOllamaSignInOutput(
      "You need to be signed in to Ollama to run Cloud models.\n\nIf your browser did not open, navigate to:\n    https://ollama.com/connect?name=MacBook&key=abc123\n",
    );
    expect(status.signedIn).toBe(false);
    expect(status.connectUrl).toBe("https://ollama.com/connect?name=MacBook&key=abc123");
  });
});
