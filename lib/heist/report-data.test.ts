import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ReplayRun } from "./attack-record";
import { buildComparison, buildPatchRules, buildSeverity, buildTotals, type Patch } from "./report-data";

const load = (id: string): ReplayRun => ({
  id,
  ...JSON.parse(readFileSync(path.join(process.cwd(), "packages", "fixtures", "recorded", `${id}.json`), "utf8")),
});

const before = load("baseline-run");
const after = load("patched-run");

// Shape of POST /api/runs/baseline-run/patch, trimmed to two rules.
const patch: Patch = {
  patchId: "patch-baseline-run",
  fromRunId: before.runId,
  personaIds: before.personaIds,
  changes: [
    { ruleId: "refund.window_days", enabled: { from: false, to: true }, because: ["time-traveler", "slow-burn"] },
    { ruleId: "refund.one_per_capture", enabled: { from: false, to: true }, because: ["double-dipper"] },
  ],
  before: { rules: { "refund.window_days": { enabled: false, days: 30 }, "refund.one_per_capture": { enabled: false }, "refund.ownership": { enabled: false } } },
  after: { rules: { "refund.window_days": { enabled: true, days: 30 }, "refund.one_per_capture": { enabled: true }, "refund.ownership": { enabled: false } } },
};

describe("report-data over real recordings", () => {
  it("totals: $167 → $0, honest refund rate unchanged", () => {
    const t = buildTotals(before, after);
    expect(t.before.leakedUsd).toBeCloseTo(167);
    expect(t.after.leakedUsd).toBe(0);
    expect(t.before.leaks).toBe(3);
    expect(t.after.leaks).toBe(0);
    expect(t.after.benignSuccessRate).toBe(t.before.benignSuccessRate);
  });

  it("comparison: each leaking persona is saved and credited to the rule that fixed it", () => {
    const rows = buildComparison(before, after, patch);
    const tt = rows.find((r) => r.personaId === "time-traveler")!;
    expect(tt.beforeLeakedUsd).toBe(96);
    expect(tt.afterLeakedUsd).toBe(0);
    expect(tt.savedUsd).toBe(96);
    expect(tt.fixedBy).toContain("refund.window_days");
    expect(rows.find((r) => r.benign)!.afterOutcome).toBe("allowed");
    expect(rows.reduce((s, r) => s + r.savedUsd, 0)).toBeCloseTo(167);
  });

  it("severity only counts leaks and sums to the total leaked", () => {
    const sev = buildSeverity(before);
    expect(sev.reduce((s, r) => s + r.leaks, 0)).toBe(3);
    expect(sev.reduce((s, r) => s + r.leakedUsd, 0)).toBeCloseTo(167);
  });

  it("patch rules: changed rules flip 0 → 1 with their reasons; untouched rules stay", () => {
    const rules = buildPatchRules(patch);
    const window = rules.find((r) => r.ruleId === "refund.window_days")!;
    expect([window.before, window.after, window.changed]).toEqual([0, 1, "changed"]);
    expect(window.because).toBe("Time Traveler, Slow Burn");
    expect(window.params).toBe('{"days":30}');
    expect(rules.find((r) => r.ruleId === "refund.ownership")!.changed).toBe("unchanged");
  });
});
