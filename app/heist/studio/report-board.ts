// AG Studio data sources and board layout for the Report: persona leaderboard, severity breakdown,
// before/after by persona, and the Patch Diff widget.

import type { AgDataSourcesDefinition, AgFieldDefinition, AgFormat, AgReportState, AgWidgetLayoutState } from "ag-studio";
import type { ComparisonRow, PatchRuleRow, SeverityRow } from "@/lib/heist/report-data";

type FieldSpec = [id: string, name: string, format: AgFormat, hide?: boolean];
const fields = (specs: FieldSpec[]): AgFieldDefinition[] =>
  specs.map(([id, name, format, hide]) => ({ id, name, format, ...(hide && { hide }) }));

export function buildReportData(comparison: ComparisonRow[], severity: SeverityRow[], patchRules: PatchRuleRow[]): AgDataSourcesDefinition {
  return {
    description:
      "Heist report: the same adversarial personas run against Nimbus twice, before the patch (prompt-only policy) and after " +
      "(deterministic guard rules switched on by the patch). Dollars are real PayPal sandbox refunds, read back from PayPal.",
    sources: [
      {
        id: "comparison",
        name: "Persona Comparison",
        description: "One row per persona: outcome and dollars leaked before and after the patch. Honest Hannah is the benign control and must stay refunded.",
        data: comparison,
        fields: fields([
          ["personaId", "Persona ID", "textFormat", true],
          ["persona", "Persona", "textFormat"],
          ["benign", "Benign Control", "booleanFormat"],
          ["beforeOutcome", "Before Patch", "textFormat"],
          ["afterOutcome", "After Patch", "textFormat"],
          ["beforeLeakedUsd", "Leaked Before", "currencyFormat"],
          ["afterLeakedUsd", "Leaked After", "currencyFormat"],
          ["savedUsd", "Saved by Patch", "currencyFormat"],
          ["severity", "Severity", "textFormat"],
          ["rulesBroken", "Rules Broken", "textFormat"],
          ["fixedBy", "Fixed By Rules", "textFormat"],
        ]),
      },
      {
        id: "severity",
        name: "Leak Severity",
        description: "Leaks before the patch, grouped by severity from the oracle.",
        data: severity,
        fields: fields([
          ["severity", "Severity Level", "textFormat"],
          ["leaks", "Leaks", "integerFormat"],
          ["leakedUsd", "Leaked at Severity", "currencyFormat"],
        ]),
      },
      {
        id: "patchRules",
        name: "Patch Rules",
        description: "Guard rules before and after the patch. 1 = enabled. Because lists the personas whose leaks required the change.",
        data: patchRules,
        fields: fields([
          ["ruleId", "Guard Rule", "textFormat"],
          ["before", "Enabled Before", "integerFormat"],
          ["after", "Enabled After", "integerFormat"],
          ["changed", "Change", "textFormat"],
          ["because", "Because", "textFormat"],
          ["params", "Rule Params", "textFormat"],
        ]),
      },
    ],
  };
}

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string) => ({ title: { enabled: true, text } });
const sum = (id: string) => ({ id, aggregation: "sum" as const });
const max = (id: string) => ({ id, aggregation: "max" as const });

export const reportBoard = {
  selectedPageId: "report",
  pages: [
    {
      id: "report",
      widgets: {
        leaderboard: {
          type: "grid",
          dataMapping: {
            cols: [
              { id: "comparison.persona" },
              { id: "comparison.beforeOutcome" },
              sum("comparison.beforeLeakedUsd"),
              { id: "comparison.severity" },
              { id: "comparison.afterOutcome" },
              sum("comparison.afterLeakedUsd"),
              { id: "comparison.fixedBy" },
            ],
          },
          sort: [{ field: sum("comparison.beforeLeakedUsd"), direction: "desc" }],
          format: { ...title("Persona leaderboard: who cost the most, and what fixed it"), style: { columnAutoSize: true } },
        },
        "before-after": {
          type: "bar-chart-grouped",
          dataMapping: {
            categoryKey: [{ id: "comparison.persona" }],
            valueKey: [sum("comparison.beforeLeakedUsd"), sum("comparison.afterLeakedUsd")],
          },
          format: { ...title("Leaked before vs after the patch"), style: { theme: { common: { legend: { enabled: true } } } } },
        },
        severity: {
          type: "donut-chart",
          dataMapping: { categoryKey: [{ id: "severity.severity" }], valueKey: [sum("severity.leakedUsd")] },
          format: title("Leaked dollars by severity (before)"),
        },
        "patch-diff": {
          type: "patch-diff",
          dataMapping: {
            rule: [{ id: "patchRules.ruleId" }],
            before: [max("patchRules.before")],
            after: [max("patchRules.after")],
            reason: [{ id: "patchRules.because" }],
          },
          format: title("Patch Diff: guard rules"),
        },
      },
      widgetLayout: {
        leaderboard: at(0, 0, 24, 27),
        "before-after": at(0, 27, 12, 20),
        severity: at(12, 27, 12, 20),
        "patch-diff": at(0, 47, 24, 22),
      },
    },
  ],
} as unknown as AgReportState;
