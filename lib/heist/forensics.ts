import type { ComparisonRow, PatchRuleRow, ReportTotals, SeverityRow } from "./report-data";

export type ForensicsSnapshot = {
  comparison: ComparisonRow[];
  severity: SeverityRow[];
  patchRules: PatchRuleRow[];
  totals: ReportTotals;
};

export function summarizeRun(snapshot: ForensicsSnapshot) {
  const leaking = snapshot.comparison
    .filter((row) => row.beforeLeakedUsd > 0)
    .sort((a, b) => b.beforeLeakedUsd - a.beforeLeakedUsd || a.persona.localeCompare(b.persona));
  const costliest = leaking[0] ?? null;

  return {
    baseline: snapshot.totals.before,
    patched: snapshot.totals.after,
    attacks: snapshot.totals.attacks,
    costliestPersona: costliest
      ? {
          persona: costliest.persona,
          personaId: costliest.personaId,
          leakedUsd: costliest.beforeLeakedUsd,
          severity: costliest.severity,
          rulesBroken: costliest.rulesBroken,
        }
      : null,
    leakingPersonas: leaking.map((row) => ({
      persona: row.persona,
      personaId: row.personaId,
      leakedUsd: row.beforeLeakedUsd,
      afterLeakedUsd: row.afterLeakedUsd,
    })),
    chart: {
      dataSource: "comparison",
      categoryField: "persona",
      valueField: "beforeLeakedUsd",
      title: "Baseline dollars leaked by persona",
    },
  };
}

export function explainLeak(snapshot: ForensicsSnapshot, personaId: string) {
  const row = snapshot.comparison.find((candidate) => candidate.personaId === personaId);
  if (!row) return null;
  return {
    persona: row.persona,
    personaId: row.personaId,
    benign: row.benign,
    beforeOutcome: row.beforeOutcome,
    afterOutcome: row.afterOutcome,
    beforeLeakedUsd: row.beforeLeakedUsd,
    afterLeakedUsd: row.afterLeakedUsd,
    savedUsd: row.savedUsd,
    severity: row.severity,
    rulesBroken: row.rulesBroken,
    fixedBy: row.fixedBy,
  };
}
