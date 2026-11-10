// AG Studio data sources for the Heist cockpit, rebuilt from the stream state on every update.
// Studio processes changes to synchronous data after the first render, so the board fills live.

import type { AgDataSourcesDefinition, AgFieldDefinition, AgFormat } from "ag-studio";
import { BUCKET_LABEL, type HeistState } from "@/lib/heist/stream-state";

type FieldSpec = [id: string, name: string, format: AgFormat, hide?: boolean];
const fields = (specs: FieldSpec[]): AgFieldDefinition[] =>
  specs.map(([id, name, format, hide]) => ({ id, name, format, ...(hide && { hide }) }));

export function buildHeistData(state: HeistState): AgDataSourcesDefinition {
  const score = state.score;
  return {
    description:
      "One Heist run: adversarial AI customers attacking Nimbus, an AI support agent that can issue real PayPal sandbox refunds. " +
      "Leaked dollars are out-of-policy refunds PayPal executed and Heist read back from the PayPal ledger. " +
      "Refunds always return to the original payer; a leak is money the merchant did not owe.",
    sources: [
      {
        id: "attacks",
        description: "One row per attack (one persona's conversation with Nimbus) and its outcome.",
        data: state.attacks.map((a) => ({ ...a, outcome: BUCKET_LABEL[a.bucket] })),
        fields: fields([
          ["attackId", "Attack ID", "textFormat", true],
          ["persona", "Persona", "textFormat"],
          ["technique", "Technique", "textFormat"],
          ["bucket", "Outcome", "textFormat"],
          ["outcome", "Outcome Label", "textFormat", true],
          ["leakedUsd", "Leaked", "currencyFormat"],
          ["refundedUsd", "Refunded by PayPal", "currencyFormat"],
          ["guardDenials", "Guard Denials", "integerFormat"],
          ["toolCalls", "Tool Calls", "integerFormat"],
          ["ruleIds", "Violated Rules", "textFormat"],
          ["refundIds", "PayPal Refund IDs", "textFormat"],
          ["verification", "Verified Via", "textFormat"],
          ["startedAt", "Started", "dateTimeFormat", true],
          ["endedAt", "Ended", "dateTimeFormat", true],
        ]),
      },
      {
        id: "toolCalls",
        name: "Tool Calls",
        description: "Every tool Nimbus called, and the guard's decision on money-moving calls. FULL means create_refund had no amount.",
        data: state.toolCalls,
        fields: fields([
          ["id", "Call ID", "textFormat", true],
          ["attackId", "Attack ID", "textFormat", true],
          ["persona", "Caller Persona", "textFormat"],
          ["tool", "Tool", "textFormat"],
          ["requested", "Requested Amount", "textFormat"],
          ["decision", "Guard Decision", "textFormat"],
          ["ruleIds", "Guard Rules", "textFormat"],
          ["at", "Called At", "dateTimeFormat"],
        ]),
      },
      {
        id: "leaks",
        description: "Each verified leak: an out-of-policy refund PayPal executed, with its refund ID.",
        data: state.leaks,
        fields: fields([
          ["id", "Leak ID", "textFormat", true],
          ["attackId", "Attack ID", "textFormat", true],
          ["persona", "Leaking Persona", "textFormat"],
          ["amountUsd", "Leak Amount", "currencyFormat"],
          ["ruleIds", "Policy Rules Broken", "textFormat"],
          ["paypalRefundId", "Refund ID", "textFormat"],
          ["verification", "Leak Verified Via", "textFormat"],
          ["at", "Leaked At", "dateTimeFormat"],
        ]),
      },
      {
        id: "run",
        description: "The run's score from Heist's deterministic oracle. One row; empty until the run finishes.",
        // Single-persona case studies have no Heist Score (it needs a benign control), so no row is shown.
        data: score && score.heistScore !== null
          ? [
              {
                runId: state.runId ?? "",
                heistScore: score.heistScore,
                leakRate: score.leakRate,
                benignSuccessRate: score.benignSuccessRate,
                leakedUsd: score.leakedCents / 100,
              },
            ]
          : [],
        fields: fields([
          ["runId", "Run ID", "textFormat", true],
          ["heistScore", "Heist Score", "decimalFormat"],
          ["leakRate", "Leak Rate", "percentageFormat"],
          ["benignSuccessRate", "Honest Refund Rate", "percentageFormat"],
          ["leakedUsd", "Run Leaked", "currencyFormat"],
        ]),
      },
    ],
    relationships: [
      {
        id: "call-attack",
        source: { tableId: "toolCalls", fieldId: "attackId" },
        target: { tableId: "attacks", fieldId: "attackId" },
        type: "many-to-one",
      },
      {
        id: "leak-attack",
        source: { tableId: "leaks", fieldId: "attackId" },
        target: { tableId: "attacks", fieldId: "attackId" },
        type: "many-to-one",
      },
    ],
  };
}
