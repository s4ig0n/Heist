"use client";

// Report: the same personas before and after the patch. Headline before/after numbers, an AG Studio
// board (persona leaderboard, before vs after, severity, Patch Diff) and the honest-customer check.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { enableStudioDevValidations } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { heistColors as c } from "@/app/heist-preview/heist-theme";
import type { ReplayRun } from "@/lib/heist/attack-record";
import {
  buildComparison,
  buildPatchRules,
  buildSeverity,
  buildTotals,
  type Patch,
} from "@/lib/heist/report-data";
import { buildReportData, reportBoard } from "../studio/report-board";
import { heistNoirTheme } from "../studio/theme";
import {
  bumpDataVersion,
  heistWidgets,
  setPatchApplyHandler,
} from "../studio/widgets";
import { HeistShell, heading, panel } from "../shell";

if (process.env.NODE_ENV !== "production") enableStudioDevValidations();

const BEFORE = "baseline-run";
const AFTER = "patched-run";

const noSubscription = () => () => {};

export function Report({ licenseKey }: { licenseKey?: string }) {
  const inBrowser = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  if (!inBrowser) return <HeistShell page="report">{null}</HeistShell>;
  return <ReportBody licenseKey={licenseKey} />;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function ReportBody({ licenseKey }: { licenseKey?: string }) {
  const router = useRouter();
  const [before, setBefore] = useState<ReplayRun | null>(null);
  const [after, setAfter] = useState<ReplayRun | null>(null);
  const [patch, setPatch] = useState<Patch | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getJson<ReplayRun>(`/api/replays/${BEFORE}`),
      getJson<ReplayRun>(`/api/replays/${AFTER}`).catch(() => null),
      // Deterministic: the same run always yields the same patch.
      getJson<Patch>(`/api/runs/${BEFORE}/patch`, { method: "POST" }).catch(
        () => null,
      ),
    ])
      .then(([b, a, p]) => {
        if (cancelled) return;
        setBefore(b);
        setAfter(a);
        setPatch(p);
      })
      .catch(
        (e: Error) =>
          !cancelled &&
          setError(`Couldn't load the recorded runs (${e.message}).`),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    if (!before) return null;
    return {
      comparison: buildComparison(before, after, patch),
      severity: buildSeverity(before),
      patchRules: buildPatchRules(patch),
      totals: buildTotals(before, after),
    };
  }, [before, after, patch]);

  const data = useMemo(
    () =>
      buildReportData(
        rows?.comparison ?? [],
        rows?.severity ?? [],
        rows?.patchRules ?? [],
      ),
    [rows],
  );

  useEffect(() => {
    bumpDataVersion();
  }, [data]);

  // "Apply and rerun": start the real rerun when the server allows it; otherwise play the recorded
  // rerun of this exact patch. Either way the Arena shows it.
  useEffect(() => {
    if (!patch) {
      setPatchApplyHandler(null);
      return;
    }
    const run = async () => {
      setPatchApplyHandler({
        label: "Apply and rerun",
        busy: true,
        run: () => {},
      });
      try {
        const res = await fetch(`/api/patches/${patch.patchId}/rerun`, {
          method: "POST",
        });
        if (res.status === 202) {
          const view = (await res.json()) as { streamUrl: string };
          router.push(
            `/heist/arena?stream=${encodeURIComponent(view.streamUrl)}`,
          );
          return;
        }
      } catch {
        // Fall through to the recording.
      }
      router.push(`/heist/arena?replay=${AFTER}`);
    };
    setPatchApplyHandler({
      label: "Apply and rerun",
      run,
      note: "Runs the same personas with only these rules on. Without a run token it plays the recorded rerun.",
    });
    return () => setPatchApplyHandler(null);
  }, [patch, router]);

  const hannahBefore = rows?.comparison.find((r) => r.benign);
  const t = rows?.totals;

  return (
    <HeistShell page="report" scroll>
      {error && (
        <p role="alert" style={{ color: c.danger, padding: 16 }}>
          {error}
        </p>
      )}

      <section
        aria-label="Before and after"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          padding: 16,
        }}
      >
        <Stat
          label="Leaked before the patch"
          value={t ? money(t.before.leakedUsd) : "…"}
          sub={t ? `${t.before.leaks} of ${t.attacks} attacks leaked` : ""}
          tone="bad"
        />
        <Stat
          label="Leaked after the patch"
          value={t ? money(t.after.leakedUsd) : "…"}
          sub={t ? `${t.after.leaks} of ${t.attacks} attacks leaked` : ""}
          tone="good"
        />
        <Stat
          label="Heist Score"
          value={
            t
              ? `${fmtScore(t.before.heistScore)} → ${fmtScore(t.after.heistScore)}`
              : "…"
          }
          sub="100 × (1 − leak rate) × honest refund rate"
          tone="neutral"
        />
        <Stat
          label="Honest Hannah refunded"
          value={
            t
              ? `${pct(t.before.benignSuccessRate)} → ${pct(t.after.benignSuccessRate)}`
              : "…"
          }
          sub={hannahBefore ? "The fix didn't block the honest customer" : ""}
          tone={
            t && t.after.benignSuccessRate < t.before.benignSuccessRate
              ? "bad"
              : "good"
          }
        />
      </section>

      <div style={{ height: 1290, padding: "0 0 16px" }}>
        {!rows ? (
          <p style={{ color: c.textMuted, padding: "0 16px" }}>
            Loading the recorded runs…
          </p>
        ) : (
          <AgStudioProvider licenseKey={licenseKey}>
            <AgStudio
              style={{ height: "100%", width: "100%" }}
              theme={heistNoirTheme}
              layout={{ widgetBorderEnabled: true }}
              data={data}
              widgets={heistWidgets}
              initialState={reportBoard}
              mode="view"
              panels={{ view: {} }}
            />
          </AgStudioProvider>
        )}
      </div>

      <section
        aria-label="How to read this"
        style={{ ...panel, margin: "0 16px 24px" }}
      >
        <h2 style={heading}>HOW TO READ THIS</h2>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            display: "grid",
            gap: 6,
            fontSize: 14,
            color: c.textMuted,
          }}
        >
          <li>
            Both runs are recorded real runs in the PayPal sandbox. Every dollar
            is a refund PayPal executed and Heist read back.
          </li>
          <li>
            &quot;After&quot; is deterministic, not hopeful: the guard checks
            each refund against the merchant&apos;s records before PayPal sees
            it, so a rule-covered leak can&apos;t happen however the
            conversation goes.
          </li>
          <li>
            Refunds always return to the original payer. A leak is money the
            merchant didn&apos;t owe, not money stolen.
          </li>
        </ul>
      </section>
    </HeistShell>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "good" | "bad" | "neutral";
}) {
  const color =
    tone === "good" ? c.success : tone === "bad" ? c.danger : c.gold;
  return (
    <div style={panel}>
      <p
        style={{
          fontSize: 12,
          letterSpacing: 1,
          color: c.textMuted,
          textTransform: "uppercase",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 32,
          fontWeight: 800,
          color,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </p>
      <p style={{ fontSize: 12, color: c.textMuted }}>{sub}</p>
    </div>
  );
}

const money = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const fmtScore = (n: number | null) =>
  n === null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1);
