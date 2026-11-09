// Before/after comparison rows for the Report, built from two recorded runs (baseline and the
// patched rerun) and the patch between them. Pure, so the Report, its tests and the Forensics
// Analyst all compute the same numbers.

import { personaName, type ReplayRun } from "./attack-record";

export type Patch = {
  patchId: string;
  fromRunId: string;
  personaIds: string[];
  changes: { ruleId: string; enabled: { from: boolean; to: boolean }; because: string[] }[];
  before: { rules: Record<string, Record<string, unknown> & { enabled: boolean }> };
  after: { rules: Record<string, Record<string, unknown> & { enabled: boolean }> };
};

export type ComparisonRow = {
  persona: string;
  personaId: string;
  benign: boolean;
  beforeOutcome: string;
  afterOutcome: string;
  beforeLeakedUsd: number;
  afterLeakedUsd: number;
  savedUsd: number;
  severity: string;
  rulesBroken: string;
  fixedBy: string;
};

export type SeverityRow = { severity: string; leaks: number; leakedUsd: number };

export type PatchRuleRow = {
  ruleId: string;
  before: number;
  after: number;
  changed: string;
  because: string;
  params: string;
};

export type ReportTotals = {
  before: { leakedUsd: number; heistScore: number | null; leakRate: number; benignSuccessRate: number; leaks: number };
  after: { leakedUsd: number; heistScore: number | null; leakRate: number; benignSuccessRate: number; leaks: number };
  attacks: number;
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

export function buildComparison(before: ReplayRun, after: ReplayRun | null, patch: Patch | null): ComparisonRow[] {
  const fixes = new Map<string, string[]>();
  for (const change of patch?.changes ?? []) {
    for (const p of change.because) fixes.set(p, [...(fixes.get(p) ?? []), change.ruleId]);
  }
  return before.records.map((rec) => {
    const afterRec = after?.records.find((r) => r.personaId === rec.personaId);
    const b = rec.verdict;
    const a = afterRec?.verdict;
    const beforeLeakedUsd = b.leakedCents / 100;
    const afterLeakedUsd = (a?.leakedCents ?? 0) / 100;
    return {
      persona: personaName(rec.personaId),
      personaId: rec.personaId,
      benign: b.benign,
      beforeOutcome: b.bucket,
      afterOutcome: a?.bucket ?? "not rerun",
      beforeLeakedUsd,
      afterLeakedUsd,
      savedUsd: Math.max(0, beforeLeakedUsd - afterLeakedUsd),
      severity: b.bucket === "leaked" ? b.severity ?? "unrated" : "",
      rulesBroken: b.violations.join(", "),
      fixedBy: (fixes.get(rec.personaId) ?? []).join(", "),
    };
  });
}

export function buildSeverity(before: ReplayRun): SeverityRow[] {
  const rows = new Map<string, SeverityRow>();
  for (const rec of before.records) {
    const v = rec.verdict;
    if (v.bucket !== "leaked") continue;
    const key = v.severity ?? "unrated";
    const row = rows.get(key) ?? { severity: key, leaks: 0, leakedUsd: 0 };
    row.leaks += 1;
    row.leakedUsd += v.leakedCents / 100;
    rows.set(key, row);
  }
  return [...rows.values()].sort((x, y) => rank(x.severity) - rank(y.severity));
}

const rank = (s: string) => {
  const i = SEVERITY_ORDER.indexOf(s);
  return i === -1 ? SEVERITY_ORDER.length : i;
};

export function buildPatchRules(patch: Patch | null): PatchRuleRow[] {
  if (!patch) return [];
  return Object.keys(patch.after.rules).map((ruleId) => {
    const beforeRule = patch.before.rules[ruleId];
    const afterRule = patch.after.rules[ruleId];
    const change = patch.changes.find((c) => c.ruleId === ruleId);
    const { enabled: _enabled, ...params } = afterRule;
    return {
      ruleId,
      before: beforeRule?.enabled ? 1 : 0,
      after: afterRule.enabled ? 1 : 0,
      changed: change ? "changed" : "unchanged",
      because: (change?.because ?? []).map(personaName).join(", "),
      params: Object.keys(params).length ? JSON.stringify(params) : "",
    };
  });
}

export function buildTotals(before: ReplayRun, after: ReplayRun | null): ReportTotals {
  const side = (run: ReplayRun | null) => ({
    leakedUsd: (run?.score?.leakedCents ?? 0) / 100,
    heistScore: run?.score?.heistScore ?? null,
    leakRate: run?.score?.leakRate ?? 0,
    benignSuccessRate: run?.score?.benignSuccessRate ?? 0,
    leaks: run?.records.filter((r) => r.verdict.bucket === "leaked").length ?? 0,
  });
  return { before: side(before), after: side(after), attacks: before.records.length };
}
