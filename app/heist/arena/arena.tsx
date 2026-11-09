"use client";

// The Arena: an AG Studio board that fills live from a Heist run, a feed beside it, and an alarm on
// the first leak. Today it plays recorded real runs (/api/replays); live runs use the same stream format.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { enableStudioDevValidations } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { heistColors as c } from "@/app/heist-preview/heist-theme";
import { useHeistStream } from "@/lib/heist/use-heist-stream";
import { liveTotals } from "@/lib/heist/stream-state";
import { buildHeistData } from "../studio/data";
import { heistNoirTheme } from "../studio/theme";
import { arenaReport } from "../studio/arena-report";
import { bumpDataVersion, heistWidgets } from "../studio/widgets";

if (process.env.NODE_ENV !== "production") enableStudioDevValidations();

const REPLAY_LABEL: Record<string, string> = {
  "baseline-run": "Nimbus as shipped (no guard)",
  "guarded-run": "Nimbus with the Heist guard",
  "hero-run": "Hero run",
  "patched-run": "Patched rerun",
};
const SPEEDS = [1, 4, 16] as const;

const noSubscription = () => () => {};

export function Arena(props: { replays: string[]; licenseKey?: string }) {
  const inBrowser = useSyncExternalStore(noSubscription, () => true, () => false);
  if (!inBrowser) return <Shell>{null}</Shell>;
  return <ArenaBoard {...props} />;
}

function ArenaBoard({ replays, licenseKey }: { replays: string[]; licenseKey?: string }) {
  const [replayId, setReplayId] = useState(replays.includes("baseline-run") ? "baseline-run" : replays[0] ?? "");
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(4);
  const [playKey, setPlayKey] = useState(0);
  const url = replayId ? `/api/replays/${replayId}/stream?speed=${speed}&play=${playKey}` : null;
  const state = useHeistStream(url);
  const totals = liveTotals(state);
  const data = useMemo(() => buildHeistData(state), [state]);

  useEffect(() => {
    bumpDataVersion();
  }, [state.version]);

  const alarm = state.firstLeakAt !== null;
  const feedTail = state.feed.slice(-40).reverse();

  return (
    <Shell>
      <section
        aria-label="Run controls"
        style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${c.border}` }}
      >
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: c.textMuted }}>
          Recorded run
          <select value={replayId} onChange={(e) => setReplayId(e.target.value)} style={control}>
            {replays.map((id) => (
              <option key={id} value={id}>
                {REPLAY_LABEL[id] ?? id}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: c.textMuted }}>
          Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])} style={control}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setPlayKey((k) => k + 1)} style={{ ...control, background: c.gold, color: c.background, fontWeight: 700, cursor: "pointer" }}>
          ▶ Replay heist
        </button>
        <span style={{ marginLeft: "auto", fontSize: 12, color: c.textMuted }}>
          {statusText(state.status)} · {totals.finished}/{totals.attacks} attacks · recorded real sandbox run{speed > 1 ? `, ${speed}× speed` : ""}
        </span>
      </section>

      {alarm && (
        <div
          role="alert"
          style={{ background: "rgba(234,119,119,0.12)", borderBottom: `1px solid ${c.danger}`, color: c.danger, padding: "10px 16px", fontWeight: 700 }}
        >
          ALARM · Nimbus issued an out-of-policy refund. ${totals.leakedUsd.toFixed(2)} leaked so far, verified against PayPal.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", flex: 1, minHeight: 0 }}>
        <div style={{ minHeight: 0 }}>
          <AgStudioProvider licenseKey={licenseKey}>
            <AgStudio
              style={{ height: "100%", width: "100%" }}
              theme={heistNoirTheme}
              layout={{ widgetBorderEnabled: true }}
              data={data}
              widgets={heistWidgets}
              initialState={arenaReport}
              mode="view"
              panels={{ view: {} }}
            />
          </AgStudioProvider>
        </div>

        <aside aria-label="Live feed" style={{ borderLeft: `1px solid ${c.border}`, background: c.surface, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <h2 style={{ fontSize: 13, letterSpacing: 2, color: c.gold, fontWeight: 700, padding: "14px 16px 8px" }}>LIVE FEED</h2>
          <ol aria-live="polite" aria-relevant="additions" style={{ listStyle: "none", margin: 0, padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
            {feedTail.length === 0 && <li style={{ color: c.textMuted, fontSize: 13 }}>Waiting for the first attack…</li>}
            {feedTail.map((f) => (
              <li key={f.id} style={{ fontSize: 13, padding: "8px 0", borderBottom: `1px solid ${c.border}`, color: toneColor(f.tone) }}>
                <time style={{ display: "block", fontSize: 11, color: c.textMuted }}>{new Date(f.at).toLocaleTimeString()}</time>
                {f.text}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ height: "100vh", display: "flex", flexDirection: "column", background: c.background, color: c.text, fontFamily: "Inter, Arial, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 24, padding: "14px 16px", borderBottom: `1px solid ${c.border}` }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>
          HEIST <span style={{ color: c.gold }}>/ ARENA</span>
        </h1>
        <nav style={{ display: "flex", gap: 18, fontSize: 14 }}>
          <Link href="/heist/arena" aria-current="page" style={{ color: c.gold }}>
            Arena
          </Link>
          <span style={{ color: c.textMuted }}>Attack Replay</span>
          <span style={{ color: c.textMuted }}>Report</span>
        </nav>
        <span style={{ marginLeft: "auto", fontSize: 12, color: c.textMuted }}>PayPal sandbox only</span>
      </header>
      {children}
    </main>
  );
}

const control: React.CSSProperties = {
  background: c.surfaceRaised,
  color: c.text,
  border: `1px solid ${c.border}`,
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 13,
};

const toneColor = (tone: string) => (tone === "leak" ? c.danger : tone === "guard" ? c.gold : tone === "ok" ? c.success : c.text);

function statusText(status: string) {
  if (status === "running") return "Running";
  if (status === "finished") return "Finished";
  if (status === "failed") return "Stream ended";
  if (status === "connecting" || status === "queued") return "Connecting";
  return "Idle";
}
