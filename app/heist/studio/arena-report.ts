// The Arena board as AG Studio report state. Field ids ('attacks.leakedUsd') refer to ./data.ts.

import type { AgReportState, AgWidgetLayoutState } from "ag-studio";

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string) => ({ title: { enabled: true, text } });
const sum = (id: string) => ({ id, aggregation: "sum" as const });
const max = (id: string) => ({ id, aggregation: "max" as const });
const countd = (id: string) => ({ id, aggregation: "countd" as const });

// KPI tiles use the custom Heist Stat widget (./widgets.tsx), not Studio's default value widget.
const stat = (text: string, value: { id: string; aggregation?: "sum" | "max" | "countd" }, tone: "plain" | "loss" | "good" | "accent" = "plain") => ({
  type: "heist-stat",
  dataMapping: { value: [value] },
  format: { ...title(text), style: { tone } },
});

export const arenaReport = {
  selectedPageId: "arena",
  pages: [
    {
      id: "arena",
      widgets: {
        vault: {
          type: "vault-meter",
          dataMapping: { leaked: [sum("attacks.leakedUsd")], blocked: [sum("attacks.guardDenials")] },
          format: title("VAULT METER"),
        },
        "kpi-refunded": stat("REFUNDED BY PAYPAL", sum("attacks.refundedUsd")),
        "kpi-score": stat("HEIST SCORE", max("run.heistScore"), "accent"),
        "kpi-attacks": stat("ATTACKS RUN", countd("attacks.attackId")),
        "kpi-leaks": stat("ATTACKS THAT LEAKED", countd("leaks.attackId"), "loss"),
        "attack-grid": {
          type: "grid",
          dataMapping: {
            cols: [
              { id: "attacks.persona" },
              { id: "attacks.bucket" },
              sum("attacks.leakedUsd"),
              { id: "attacks.refundIds" },
              { id: "attacks.ruleIds" },
            ],
          },
          format: { ...title("ATTACK GRID"), style: { columnAutoSize: true } },
        },
        "leaked-by-persona": {
          type: "bar-chart-grouped",
          // From the leaks table, so personas that leaked nothing don't take up rows.
          dataMapping: { categoryKey: [{ id: "leaks.persona" }], valueKey: [sum("leaks.amountUsd")] },
          sort: [{ field: sum("leaks.amountUsd"), direction: "desc" }],
          format: title("DOLLARS LEAKED BY PERSONA"),
        },
        "tool-calls": {
          type: "grid",
          dataMapping: {
            cols: [
              { id: "toolCalls.persona" },
              { id: "toolCalls.tool" },
              { id: "toolCalls.requested" },
              { id: "toolCalls.decision" },
              { id: "toolCalls.ruleIds" },
            ],
          },
          format: { ...title("TOOL CALLS AND GUARD DECISIONS"), style: { columnAutoSize: true } },
        },
      },
      // The Vault Meter leads; four smaller stats sit beside it.
      widgetLayout: {
        vault: at(0, 0, 12, 12),
        "kpi-refunded": at(12, 0, 6, 6),
        "kpi-score": at(18, 0, 6, 6),
        "kpi-attacks": at(12, 6, 6, 6),
        "kpi-leaks": at(18, 6, 6, 6),
        "attack-grid": at(0, 12, 24, 26),
        "leaked-by-persona": at(0, 38, 24, 14),
        "tool-calls": at(0, 52, 24, 36),
      },
    },
  ],
} as unknown as AgReportState;
