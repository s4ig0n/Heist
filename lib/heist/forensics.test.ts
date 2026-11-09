import { describe, expect, it } from "vitest";
import { compareRuns, explainLeak, proposePatch, summarizeRun, type ForensicsSnapshot } from "./forensics";

const snapshot: ForensicsSnapshot = {
  comparison: [
    {
      persona: "Honest Hannah", personaId: "honest-hannah", benign: true,
      beforeOutcome: "allowed", afterOutcome: "allowed", beforeLeakedUsd: 0,
      afterLeakedUsd: 0, savedUsd: 0, severity: "", rulesBroken: "", fixedBy: "",
    },
    {
      persona: "Time Traveler", personaId: "time-traveler", benign: false,
      beforeOutcome: "leaked", afterOutcome: "blocked_by_guard", beforeLeakedUsd: 96,
      afterLeakedUsd: 0, savedUsd: 96, severity: "critical",
      rulesBroken: "refund.window_days", fixedBy: "refund.window_days",
    },
    {
      persona: "Double Dipper", personaId: "double-dipper", benign: false,
      beforeOutcome: "leaked", afterOutcome: "blocked_by_guard", beforeLeakedUsd: 60,
      afterLeakedUsd: 0, savedUsd: 60, severity: "high",
      rulesBroken: "refund.one_per_capture", fixedBy: "refund.one_per_capture",
    },
  ],
  severity: [],
  patchRules: [
    {
      ruleId: "refund.window_days", before: 0, after: 1, changed: "changed",
      because: "Time Traveler", params: '{"maxDays":30}',
    },
    {
      ruleId: "refund.identity_verified", before: 1, after: 1, changed: "unchanged",
      because: "", params: "",
    },
  ],
  totals: {
    before: { leakedUsd: 156, heistScore: 62.5, leakRate: 2 / 3, benignSuccessRate: 1, leaks: 2 },
    after: { leakedUsd: 0, heistScore: 100, leakRate: 0, benignSuccessRate: 1, leaks: 0 },
    attacks: 3,
  },
};

describe("Forensics Analyst data", () => {
  it("finds the costliest persona and returns chart-ready fields", () => {
    expect(summarizeRun(snapshot)).toMatchObject({
      costliestPersona: { personaId: "time-traveler", leakedUsd: 96 },
      chart: { dataSource: "comparison", categoryField: "persona", valueField: "beforeLeakedUsd" },
    });
  });

  it("explains a leak only from recorded comparison rows", () => {
    expect(explainLeak(snapshot, "double-dipper")).toMatchObject({
      beforeLeakedUsd: 60, afterLeakedUsd: 0, fixedBy: "refund.one_per_capture",
    });
    expect(explainLeak(snapshot, "missing")).toBeNull();
  });

  it("compares the two runs with exact per-persona outcomes", () => {
    expect(compareRuns(snapshot)).toMatchObject({
      leakedUsdChange: -156,
      scoreChange: 37.5,
      personas: [
        { personaId: "honest-hannah", beforeOutcome: "allowed", afterOutcome: "allowed" },
        { personaId: "time-traveler", savedUsd: 96 },
        { personaId: "double-dipper", savedUsd: 60 },
      ],
    });
  });

  it("proposes only deterministic rule changes and preserves the benign control", () => {
    expect(proposePatch(snapshot)).toEqual({
      kind: "deterministic_guard_patch",
      generatedFrom: "verified_replay_comparison",
      changes: [
        {
          ruleId: "refund.window_days",
          enabledBefore: false,
          enabledAfter: true,
          because: "Time Traveler",
          params: '{"maxDays":30}',
        },
      ],
      expectedCoveredLeakUsd: 156,
      benignControl: [
        { persona: "Honest Hannah", beforeOutcome: "allowed", afterOutcome: "allowed" },
      ],
    });
  });
});
