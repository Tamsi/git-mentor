import { describe, expect, it } from "vitest";
import { runBenchmark } from "./eval.js";

describe("runBenchmark", () => {
  it("passes synthetic profiles", () => {
    const report = runBenchmark();
    expect(report.total).toBeGreaterThanOrEqual(3);
    expect(report.passRate).toBeGreaterThanOrEqual(0.8);
  });
});
