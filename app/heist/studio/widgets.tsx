"use client";

// Heist's AG Studio widgets:
//   - Vault Meter: a custom widget (AgWidgetDefinition with dataMapping + form) showing dollars leaked,
//     with a count-up and an alarm state. Any numeric field can be mapped, so Studio's own AI can place it.
//   - Status cells: an override of Studio's grid widget that renders attack outcomes as colored pills.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AgWidgetField, AgWidgetParams } from "ag-studio";
import { createWidgets, type AgWidgetDefinition } from "ag-studio-react";
import type { CustomCellRendererProps } from "ag-grid-react";
import { heistColors as c } from "@/app/heist-preview/heist-theme";
import { BUCKET_LABEL, type Bucket } from "@/lib/heist/stream-state";

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
      setShown(target);
      return;
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
  const label = blockedField ? widgetApi.getFieldName(blockedField) : "";

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
        borderRadius: 6,
        boxShadow: alarm ? `inset 0 0 0 2px ${c.danger}` : "none",
        background: alarm ? "rgba(234, 119, 119, 0.08)" : "transparent",
        transition: "box-shadow 300ms, background 300ms",
      }}
    >
      <span style={{ fontSize: 12, letterSpacing: 2, color: alarm ? c.danger : c.textMuted, fontWeight: 700 }}>
        {alarm ? "● VAULT BREACHED" : "VAULT SECURE"}
      </span>
      <span
        style={{
          fontSize: 40,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          color: alarm ? c.danger : c.success,
          lineHeight: 1.05,
        }}
      >
        ${shown.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <span style={{ fontSize: 12, color: c.textMuted }}>
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

function StatusCell(props: CustomCellRendererProps) {
  const bucket = props.value as Bucket;
  const color = BUCKET_COLOR[bucket] ?? c.textMuted;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 10px",
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        fontSize: 12,
        fontWeight: 700,
        lineHeight: "20px",
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: color }} />
      {BUCKET_LABEL[bucket] ?? String(props.value ?? "")}
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

export const heistWidgets = createWidgets({
  additionalTypes: [vaultMeter],
  overrides: [
    {
      id: "grid",
      options: {
        createCellRenderer: (field: AgWidgetField) => {
          if (isField(field, "attacks.bucket")) return StatusCell;
          if (isField(field, "attacks.leakedUsd") || isField(field, "leaks.amountUsd")) return MoneyCell;
          return undefined;
        },
      },
    },
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
