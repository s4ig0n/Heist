// The Arena board as AG Studio report state. Field ids ('attacks.leakedUsd') refer to ./data.ts.

import type { AgReportState, AgWidgetLayoutState } from "ag-studio";

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string) => ({ title: { enabled: true, text } });
const sum = (id: string) => ({ id, aggregation: "sum" as const });
const max = (id: string) => ({ id, aggregation: "max" as const });
const countd = (id: string) => ({ id, aggregation: "countd" as const });

const kpi = (text: string, value: { id: string; aggregation?: "sum" | "max" | "countd" }) => ({
  type: "value" as const,
  dataMapping: { value: [value] },
  format: {
    title: { enabled: true, text },
    caption: { enabled: false, text: "" },
    style: { typography: { fontFamily: "Inter, Arial, sans-serif", fontSize: 30, fontWeight: "bold" as const, fontStyle: "normal" as const } },
  },
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
          format: title("Vault Meter"),
        },
        "kpi-attacks": kpi("Attacks", countd("attacks.attackId")),
        "kpi-refunded": kpi("Refunded by PayPal", sum("attacks.refundedUsd")),
        "kpi-score": kpi("Heist Score", max("run.heistScore")),
        "attack-grid": {
          type: "grid",
          dataMapping: {
            cols: [
              { id: "attacks.persona" },
              { id: "attacks.technique" },
              { id: "attacks.bucket" },
              sum("attacks.leakedUsd"),
              sum("attacks.refundedUsd"),
              { id: "attacks.ruleIds" },
              { id: "attacks.refundIds" },
            ],
          },
          format: { ...title("Attack grid"), style: { columnAutoSize: true } },
        },
        "leaked-by-persona": {
          type: "bar-chart-grouped",
          dataMapping: { categoryKey: [{ id: "attacks.persona" }], valueKey: [sum("attacks.leakedUsd")] },
          sort: [{ field: sum("attacks.leakedUsd"), direction: "desc" }],
          format: title("Dollars leaked by persona"),
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
          format: { ...title("Tool calls and guard decisions"), style: { columnAutoSize: true } },
        },
      },
      widgetLayout: {
        vault: at(0, 0, 8, 9),
        "kpi-attacks": at(8, 0, 5, 9),
        "kpi-refunded": at(13, 0, 6, 9),
        "kpi-score": at(19, 0, 5, 9),
        "attack-grid": at(0, 9, 24, 22),
        "leaked-by-persona": at(0, 31, 10, 20),
        "tool-calls": at(10, 31, 14, 20),
      },
    },
  ],
} as unknown as AgReportState;
