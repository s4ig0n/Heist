import { describe, expect, it } from "vitest";
import { explainLeak, summarizeRun, type ForensicsSnapshot } from "./forensics";

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
  patchRules: [],
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
});
