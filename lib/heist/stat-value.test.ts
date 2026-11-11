import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { statValueWhenEmpty } from "./stat-value";

describe("statValueWhenEmpty", () => {
  it("counts and sums of nothing are zero", () => {
    expect(statValueWhenEmpty("sum")).toBe(0);
    expect(statValueWhenEmpty("countd")).toBe(0);
    expect(statValueWhenEmpty(undefined)).toBe(0);
  });

  it("a max, min or average of nothing has no value", () => {
    expect(statValueWhenEmpty("max")).toBeNull();
    expect(statValueWhenEmpty("min")).toBeNull();
    expect(statValueWhenEmpty("avg")).toBeNull();
  });

  it("the recordings with no score are the ones the Arena must show as a dash", () => {
    const unscored = ["ten-persona-plain", "tool-whisperer-guarded", "trojan-note-plain", "trojan-note-guarded"];
    for (const id of unscored) {
      const run = JSON.parse(readFileSync(`packages/fixtures/recorded/${id}.json`, "utf8"));
      expect(run.score.heistScore, id).toBeNull();
    }
    const scored = JSON.parse(readFileSync("packages/fixtures/recorded/baseline-run.json", "utf8"));
    expect(scored.score.heistScore).toBe(62.5);
  });
});
