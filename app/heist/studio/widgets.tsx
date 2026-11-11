"use client";

// Heist's AG Studio widgets:
//   - Vault Meter: a custom widget (AgWidgetDefinition with dataMapping + form) showing dollars leaked,
//     with a count-up and an alarm state. Any numeric field can be mapped, so Studio's own AI can place it.
//   - Status cells: an override of Studio's grid widget that renders attack outcomes as colored pills.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AgExternalShape, AgFormatShapeParams, AgWidgetField, AgWidgetParams } from "ag-studio";
import { createWidgets, type AgWidgetDefinition } from "ag-studio-react";
import type { CustomCellRendererProps } from "ag-grid-react";
import { heistColors as c } from "@/app/heist/heist-theme";
import { BUCKET_LABEL, type Bucket } from "@/lib/heist/stream-state";

const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const DISPLAY = 'Archivo, "Arial Narrow", system-ui, sans-serif';

// --- Data version ----------------------------------------------------------------------------
// Studio re-renders a widget when its config changes, not when rows arrive. The Arena bumps this
// version on every stream update, and data-reading widgets re-query when it changes.

let dataVersion = 0;
const listeners = new Set<() => void>();
export function bumpDataVersion() {
  dataVersion += 1;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const useDataVersion = () => useSyncExternalStore(subscribe, () => dataVersion, () => 0);

type TitleFormat = { title?: { enabled?: boolean; text?: string } };

/** Studio 3 exposes its shape builder through defineAiCommand; the command is never executed. */
const titleFormatShape = ({ api }: AgFormatShapeParams): AgExternalShape<TitleFormat> =>
  api.defineAiCommand((s) => ({
    input: s.object({
      title: s.object({ enabled: s.boolean().optional(), text: s.string().optional() }).optional(),
    }),
    execute: () => ({ success: true as const, value: null }),
  })).shape;

// --- Vault Meter ----------------------------------------------------------------------------

type VaultMeterState = {
  type: "vault-meter";
  dataMapping: { leaked?: unknown[]; blocked?: unknown[] };
  format: { title?: { enabled?: boolean; text?: string } };
};

const readNumber = (row: Record<string, unknown> | undefined, field: AgWidgetField | undefined): number => {
  if (!row || !field) return 0;
  const value = row[field.key] ?? row[field.fieldId];
  return typeof value === "number" ? value : Number(value) || 0;
};

function useCountUp(target: number): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      from.current = target;
      const frame = requestAnimationFrame(() => setShown(target));
      return () => cancelAnimationFrame(frame);
    }
    const start = performance.now();
    const begin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / 700, 1);
      const value = begin + (target - begin) * (1 - Math.pow(1 - t, 3));
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

function VaultMeter(params: AgWidgetParams<VaultMeterState>) {
  const { widgetApi, dataMapping, format } = params;
  const version = useDataVersion();
  const [totals, setTotals] = useState({ leaked: 0, blocked: 0 });
  const leakedField = dataMapping.leaked?.[0];
  const blockedField = dataMapping.blocked?.[0];

  useEffect(() => {
    const queryFields = [leakedField, blockedField].filter((f): f is AgWidgetField => !!f);
    if (queryFields.length === 0) return;
    let cancelled = false;
    widgetApi
      .getData({ fields: queryFields })
      .then(({ results }) => {
        if (cancelled) return;
        const row = results.rows[0];
        setTotals({ leaked: readNumber(row, leakedField), blocked: readNumber(row, blockedField) });
      })
      .catch(() => {
        // An empty source before the first attack: keep showing zero.
      });
    return () => {
      cancelled = true;
    };
  }, [widgetApi, leakedField, blockedField, version]);

  const shown = useCountUp(totals.leaked);
  const alarm = totals.leaked > 0;
  // Studio appends the aggregation, e.g. "Guard Denials (sum)"; the caption reads better without it.
  const label = blockedField ? widgetApi.getFieldName(blockedField).replace(/\s*\([a-z]+\)$/i, "") : "";

  return (
    <div
      role="group"
      aria-label={`${format.title?.text ?? "Vault Meter"}: $${totals.leaked.toFixed(2)} leaked`}
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 8,
        padding: "12px 14px",
        boxSizing: "border-box",
        borderRadius: 0,
        transition: "box-shadow 300ms, background 300ms",
      }}
    >
      <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 2, color: alarm ? c.danger : c.textMuted, fontWeight: 600 }}>
        {alarm ? "● VAULT BREACHED" : "VAULT SECURE"}
      </span>
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: 64,
          fontWeight: 900,
          fontStretch: "125%",
          letterSpacing: -1,
          fontVariantNumeric: "tabular-nums",
          color: alarm ? c.danger : c.success,
          lineHeight: 1,
        }}
      >
        ${shown.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <span style={{ fontSize: 13, color: c.textMuted }}>
        leaked in real PayPal sandbox refunds
        {blockedField ? ` · ${totals.blocked.toLocaleString("en-US")} ${label.toLowerCase()}` : ""}
      </span>
    </div>
  );
}

const vaultMeter: AgWidgetDefinition<"vault-meter", VaultMeterState> = {
  id: "vault-meter",
  label: "Vault Meter",
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="4"/><path d="M12 8v1M12 15v1M8 12h1M15 12h1"/></svg>`,
  dataMapping: {
    leaked: {
      type: "field",
      supportedRoles: ["numeric"],
      required: true,
      intent: "value",
      aiDescription: "Dollars leaked: out-of-policy refunds PayPal executed. Usually sum of attacks.leakedUsd.",
    },
    blocked: {
      type: "field",
      supportedRoles: ["numeric"],
      intent: "value",
      aiDescription: "Optional secondary count shown under the total, such as sum of attacks.guardDenials.",
    },
  },
  formatShape: titleFormatShape,
  form: (p) =>
    p.createDefaults({
      dataMappingItems: [
        { key: "leaked", label: "Dollars leaked" },
        { key: "blocked", label: "Secondary count" },
      ],
    }),
  comp: VaultMeter,
  defaultSize: { width: 6, height: 9 },
  minSize: { width: 4, height: 7 },
  ai: {
    label: "Vault Meter",
    description: "A single large dollar figure with an alarm state when it is above zero.",
    usage: "Use for the headline amount of money an AI agent was talked into refunding. Not for trends or breakdowns.",
    configuration: "Map leaked to a currency measure such as sum of attacks.leakedUsd.",
  },
};

// --- Stat tile ---------------------------------------------------------------------------
// A KPI in the landing page's style: one large number in the display face, formatted from the field's
// own format (currency, percentage, count), with an optional tone. Replaces Studio's default value widget.

type StatTone = "plain" | "loss" | "good" | "accent";
type StatTileState = {
  type: "heist-stat";
  dataMapping: { value?: unknown[] };
  format: { title?: { enabled?: boolean; text?: string }; style?: { tone?: StatTone } };
};

export function formatStat(value: number | null, format: string | undefined): string {
  if (value === null || Number.isNaN(value)) return "—";
  if (format === "currencyFormat") return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (format === "percentageFormat") return `${Math.round(value * 100)}%`;
  if (format === "integerFormat") return Math.round(value).toLocaleString("en-US");
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(1);
}

const TONE_COLOR: Record<StatTone, string> = { plain: c.text, loss: c.danger, good: c.success, accent: c.gold };

function StatTile(params: AgWidgetParams<StatTileState>) {
  const { widgetApi, dataMapping, format } = params;
  const version = useDataVersion();
  const field = dataMapping.value?.[0] as AgWidgetField | undefined;
  const [value, setValue] = useState<number | null>(null);

  useEffect(() => {
    if (!field) return;
    let cancelled = false;
    widgetApi
      .getData({ fields: [field] })
      .then(({ results }) => {
        if (cancelled) return;
        const row = results.rows[0];
        // No rows means nothing matched yet (for example, no leaks): that is a real zero.
        setValue(row ? readNumber(row, field) : 0);
      })
      .catch(() => !cancelled && setValue(null));
    return () => {
      cancelled = true;
    };
  }, [widgetApi, field, version]);

  const tone = format.style?.tone ?? "plain";
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "flex-end", padding: "4px 2px 6px", boxSizing: "border-box" }}>
      <span
        style={{
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontStretch: "125%",
          fontSize: 40,
          lineHeight: 1,
          letterSpacing: -0.5,
          fontVariantNumeric: "tabular-nums",
          color: value === null ? c.textMuted : TONE_COLOR[tone],
        }}
      >
        {formatStat(value, field?.format)}
      </span>
    </div>
  );
}

const statTile: AgWidgetDefinition<"heist-stat", StatTileState> = {
  id: "heist-stat",
  label: "Heist Stat",
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19h16M7 15V9M12 15V5M17 15v-3"/></svg>`,
  dataMapping: {
    value: {
      type: "field",
      supportedRoles: ["numeric"],
      required: true,
      intent: "value",
      aiDescription: "The number to show, usually an aggregated measure such as sum of attacks.refundedUsd or max of run.heistScore.",
    },
  },
  form: (p) => p.createDefaults({ dataMappingItems: [{ key: "value", label: "Value" }] }),
  comp: StatTile,
  defaultSize: { width: 5, height: 8 },
  minSize: { width: 3, height: 6 },
  ai: {
    label: "Heist Stat",
    description: "One large number in the Heist display style, formatted from the field (dollars, percent or count).",
    usage: "Use for a single headline figure next to the Vault Meter. Not for trends or breakdowns.",
    configuration: "Map value to one aggregated numeric field.",
  },
};

// --- Status cells ------------------------------------------------------------------------

const BUCKET_COLOR: Record<Bucket, string> = {
  running: c.info,
  leaked: c.danger,
  blocked_by_guard: c.gold,
  blocked_by_paypal: c.warning,
  refused_by_agent: c.success,
  allowed: c.success,
  benign_denied: c.danger,
  failed: c.textMuted,
};

// Short labels so the pill always fits its column; the full wording stays available to screen readers.
const PILL_LABEL: Record<Bucket, string> = {
  running: "Running",
  leaked: "Leaked",
  blocked_by_guard: "Guard blocked",
  blocked_by_paypal: "PayPal blocked",
  refused_by_agent: "Refused",
  allowed: "Allowed",
  benign_denied: "Honest denied",
  failed: "Failed",
};

function StatusCell(props: CustomCellRendererProps) {
  const bucket = props.value as Bucket;
  const color = BUCKET_COLOR[bucket] ?? c.textMuted;
  return (
    <span
      title={BUCKET_LABEL[bucket]}
      aria-label={BUCKET_LABEL[bucket]}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        boxSizing: "border-box",
        maxWidth: "100%",
        padding: "0 9px",
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.3,
        lineHeight: "20px",
        whiteSpace: "nowrap",
        verticalAlign: "middle",
      }}
    >
      <span aria-hidden style={{ flex: "none", width: 6, height: 6, borderRadius: 3, background: color }} />
      {PILL_LABEL[bucket] ?? String(props.value ?? "")}
    </span>
  );
}

// Some attacks produce two refunds (Double Dipper). Show the first and a count so the column never clips;
// the full list stays in the tooltip and for screen readers, and Attack Replay shows every ID.
function RefundIdsCell(props: CustomCellRendererProps) {
  const ids = String(props.value ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) return null;
  const full = ids.join(", ");
  return (
    <span title={full} aria-label={full} style={{ fontFamily: MONO, fontSize: 12, whiteSpace: "nowrap" }}>
      {ids[0]}
      {ids.length > 1 && <span style={{ color: c.textMuted }}> +{ids.length - 1} more</span>}
    </span>
  );
}

function MoneyCell(props: CustomCellRendererProps) {
  const n = Number(props.value) || 0;
  return (
    <span style={{ color: n > 0 ? c.danger : c.textMuted, fontWeight: n > 0 ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>
      ${n.toFixed(2)}
    </span>
  );
}

const isField = (field: AgWidgetField, id: string) => field.fieldId === id || field.rootFieldId === id;

// --- Patch Diff ------------------------------------------------------------------------------
// The guard's rule JSON before and after the patch, one line per rule, with the personas that made
// each change necessary. "Apply and rerun" calls the handler the page registers.

type PatchDiffState = {
  type: "patch-diff";
  dataMapping: { rule?: unknown[]; before?: unknown[]; after?: unknown[]; reason?: unknown[] };
  format: { title?: { enabled?: boolean; text?: string } };
};

type ApplyHandler = { label: string; run: () => void; busy?: boolean; note?: string } | null;
let applyHandler: ApplyHandler = null;
const applyListeners = new Set<() => void>();
export function setPatchApplyHandler(handler: ApplyHandler) {
  applyHandler = handler;
  applyListeners.forEach((l) => l());
}
const useApplyHandler = () =>
  useSyncExternalStore(
    (l) => {
      applyListeners.add(l);
      return () => applyListeners.delete(l);
    },
    () => applyHandler,
    () => null,
  );

const readText = (row: Record<string, unknown>, field: AgWidgetField | undefined) =>
  field ? String(row[field.key] ?? row[field.fieldId] ?? "") : "";

function PatchDiff(params: AgWidgetParams<PatchDiffState>) {
  const { widgetApi, dataMapping } = params;
  const version = useDataVersion();
  const apply = useApplyHandler();
  const [rows, setRows] = useState<{ rule: string; before: boolean; after: boolean; reason: string }[]>([]);
  const ruleField = dataMapping.rule?.[0];
  const beforeField = dataMapping.before?.[0];
  const afterField = dataMapping.after?.[0];
  const reasonField = dataMapping.reason?.[0];

  useEffect(() => {
    const fields = [ruleField, beforeField, afterField, reasonField].filter((f): f is AgWidgetField => !!f);
    if (!ruleField || !afterField) return;
    let cancelled = false;
    widgetApi
      .getData({ fields })
      .then(({ results }) => {
        if (cancelled) return;
        setRows(
          results.rows
            .map((r) => ({
              rule: readText(r, ruleField),
              before: readNumber(r, beforeField) > 0,
              after: readNumber(r, afterField) > 0,
              reason: readText(r, reasonField),
            }))
            .sort((a, b) => Number(b.after !== b.before) - Number(a.after !== a.before) || a.rule.localeCompare(b.rule)),
        );
      })
      .catch(() => setRows([]));
    return () => {
      cancelled = true;
    };
  }, [widgetApi, ruleField, beforeField, afterField, reasonField, version]);

  const changed = rows.filter((r) => r.before !== r.after).length;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 10, padding: "4px 2px", boxSizing: "border-box" }}>
      <p style={{ fontSize: 12, color: c.textMuted }}>
        {rows.length === 0
          ? "No patch: this run leaked nothing."
          : `${changed} rule${changed === 1 ? "" : "s"} switched on. Picked by code from the leaks, not by an LLM.`}
      </p>
      <pre
        aria-label="Guard rules before and after the patch"
        style={{
          flex: 1,
          margin: 0,
          overflow: "auto",
          background: c.background,
          border: `1px solid ${c.border}`,
          borderRadius: 0,
          padding: 12,
          fontSize: 12,
          lineHeight: 1.7,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        }}
      >
        {rows.map((r) =>
          r.before === r.after ? (
            <div key={r.rule} style={{ color: c.textMuted }}>
              {"  "}&quot;{r.rule}&quot;: {"{"} enabled: {String(r.after)} {"}"}
            </div>
          ) : (
            <div key={r.rule}>
              <div style={{ color: c.danger, background: "rgba(255,122,97,0.10)" }}>
                - &quot;{r.rule}&quot;: {"{"} enabled: {String(r.before)} {"}"}
              </div>
              <div style={{ color: c.success, background: "rgba(145,199,170,0.10)" }}>
                + &quot;{r.rule}&quot;: {"{"} enabled: {String(r.after)} {"}"}
                {r.reason && <span style={{ color: c.textMuted }}>{"   "}← {r.reason}</span>}
              </div>
            </div>
          ),
        )}
      </pre>
      {apply && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={apply.run}
            disabled={apply.busy}
            style={{ background: c.gold, color: c.background, border: "none", borderRadius: 0, padding: "8px 14px", fontWeight: 700, cursor: "pointer" }}
          >
            {apply.busy ? "Starting…" : apply.label}
          </button>
          {apply.note && <span style={{ fontSize: 12, color: c.textMuted }}>{apply.note}</span>}
        </div>
      )}
    </div>
  );
}

const patchDiff: AgWidgetDefinition<"patch-diff", PatchDiffState> = {
  id: "patch-diff",
  label: "Patch Diff",
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 7h6M8 4v6M5 17h6"/><rect x="14" y="4" width="6" height="16" rx="1"/></svg>`,
  dataMapping: {
    rule: { type: "field", supportedRoles: ["category"], required: true, intent: "category", aiDescription: "Guard rule id, usually patchRules.ruleId." },
    before: { type: "field", supportedRoles: ["numeric"], intent: "value", aiDescription: "1 if the rule was on before the patch (max of patchRules.before)." },
    after: { type: "field", supportedRoles: ["numeric"], required: true, intent: "value", aiDescription: "1 if the rule is on after the patch (max of patchRules.after)." },
    reason: { type: "field", supportedRoles: ["category"], intent: "category", aiDescription: "Which personas made the change necessary (patchRules.because)." },
  },
  formatShape: titleFormatShape,
  form: (p) =>
    p.createDefaults({
      dataMappingItems: [
        { key: "rule", label: "Rule" },
        { key: "before", label: "Enabled before" },
        { key: "after", label: "Enabled after" },
        { key: "reason", label: "Because of" },
      ],
    }),
  comp: PatchDiff,
  defaultSize: { width: 12, height: 20 },
  minSize: { width: 8, height: 12 },
  ai: {
    label: "Patch Diff",
    description: "A code-style diff of guard rules before and after a patch, with the reason for each change.",
    usage: "Use to show which deterministic guard rules a patch switches on. Not for amounts.",
    configuration: "Map rule to patchRules.ruleId, before and after to max of patchRules.before/after, reason to patchRules.because.",
  },
};

export const heistWidgets = createWidgets({
  additionalTypes: [vaultMeter, statTile, patchDiff],
  overrides: [
    {
      id: "grid",
      options: {
        createCellRenderer: (field: AgWidgetField) => {
          if (isField(field, "attacks.bucket")) return StatusCell;
          if (isField(field, "attacks.refundIds")) return RefundIdsCell;
          if (
            isField(field, "comparison.beforeOutcome") ||
            isField(field, "comparison.afterOutcome")
          )
            return StatusCell;
          if (
            isField(field, "attacks.leakedUsd") ||
            isField(field, "leaks.amountUsd") ||
            isField(field, "comparison.beforeLeakedUsd") ||
            isField(field, "comparison.afterLeakedUsd")
          )
            return MoneyCell;
          return undefined;
        },
      },
    },
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
