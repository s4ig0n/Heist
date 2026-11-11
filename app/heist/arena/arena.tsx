"use client";

// The Arena: an AG Studio board that fills live from a Heist run, a feed beside it, and an alarm on
// the first leak. Today it plays recorded real runs (/api/replays); live runs use the same stream format.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { HeistShell, REPLAY_LABEL, control } from "../shell";
import { enableStudioDevValidations } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { heistColors as c } from "@/app/heist/heist-theme";
import { useHeistStream } from "@/lib/heist/use-heist-stream";
import { liveTotals } from "@/lib/heist/stream-state";
import { buildHeistData } from "../studio/data";
import { heistNoirTheme } from "../studio/theme";
import { arenaReport } from "../studio/arena-report";
import { bumpDataVersion, heistWidgets } from "../studio/widgets";

if (process.env.NODE_ENV !== "production") enableStudioDevValidations();


const SPEEDS = [1, 4, 16] as const;

const noSubscription = () => () => {};

type ArenaProps = { replays: string[]; initialReplay?: string; liveStream?: string; licenseKey?: string };

export function Arena(props: ArenaProps) {
  const inBrowser = useSyncExternalStore(noSubscription, () => true, () => false);
  if (!inBrowser) return <HeistShell page="arena">{null}</HeistShell>;
  return <ArenaBoard {...props} />;
}

function ArenaBoard({ replays, initialReplay, liveStream, licenseKey }: ArenaProps) {
  const [replayId, setReplayId] = useState(initialReplay ?? (replays.includes("baseline-run") ? "baseline-run" : replays[0] ?? ""));
  const [live, setLive] = useState(liveStream);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(4);
  const [playKey, setPlayKey] = useState(0);
  const url = live ?? (replayId ? `/api/replays/${replayId}/stream?speed=${speed}&play=${playKey}` : null);
  const state = useHeistStream(url);
  const totals = liveTotals(state);
  const data = useMemo(() => buildHeistData(state), [state]);

  useEffect(() => {
    bumpDataVersion();
  }, [state.version]);

  const alarm = state.firstLeakAt !== null;
  const feedTail = state.feed.slice(-40).reverse();
  const hasSource = Boolean(url);
  const streamFailed = state.status === "failed";

  return (
    <HeistShell page="arena">
      <section
        aria-label="Run controls"
        style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${c.border}` }}
      >
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: c.textMuted }}>
          Recorded run
          <select value={replayId} disabled={replays.length === 0} onChange={(e) => {
            setLive(undefined);
            setReplayId(e.target.value);
          }} style={control}>
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
        <button type="button" disabled={!hasSource} onClick={() => {
            setLive(undefined);
            setPlayKey((k) => k + 1);
          }} style={{ ...control, background: c.gold, color: c.background, fontWeight: 700, cursor: "pointer" }}>
          ▶ Replay heist
        </button>
        {replayId && (
          <Link href={`/heist/replay?run=${replayId}`} style={{ fontSize: 13, color: c.gold }}>
            Open attack replays →
          </Link>
        )}
        <span aria-live="polite" style={{ marginLeft: "auto", fontSize: 12, color: c.textMuted }}>
          {statusText(state.status)} · {totals.finished}/{totals.attacks} attacks · {live ? "LIVE run in the PayPal sandbox" : `recorded real sandbox run${speed > 1 ? `, ${speed}× speed` : ""}`}
        </span>
      </section>

      {!hasSource && (
        <div role="status" className="heist-state-panel">
          <strong>No run is available.</strong>
          <span>Add a verified replay or start a live run to populate the Arena.</span>
        </div>
      )}

      {hasSource && (state.status === "connecting" || state.status === "queued") && (
        <div role="status" aria-live="polite" className="heist-state-panel">
          <strong>Loading run evidence…</strong>
          <span>The Arena will update as verified events arrive.</span>
        </div>
      )}

      {streamFailed && (
        <div role="alert" className="heist-state-panel heist-state-error">
          <strong>The run stream ended before completion.</strong>
          <span>{state.statusMessage ?? "Replay the run to reconnect."}</span>
          <button type="button" onClick={() => setPlayKey((key) => key + 1)} style={control}>
            Retry run
          </button>
        </div>
      )}

      {alarm && (
        <div
          role="alert"
          style={{ background: "rgba(255,122,97,0.12)", borderBottom: `1px solid ${c.danger}`, color: c.danger, padding: "10px 16px", fontWeight: 700 }}
        >
          ALARM · Nimbus issued an out-of-policy refund. ${totals.leakedUsd.toFixed(2)} leaked so far, verified against PayPal.
        </div>
      )}

      <div className="heist-arena-grid" aria-busy={state.status === "connecting" || state.status === "queued"}>
        <div className="heist-studio-frame" style={{ minHeight: 0 }}>
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

        <aside className="heist-arena-feed" aria-label="Live feed" style={{ borderLeft: `1px solid ${c.border}`, background: c.surface, display: "flex", flexDirection: "column", minHeight: 0 }}>
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
    </HeistShell>
  );
}



const toneColor = (tone: string) => (tone === "leak" ? c.danger : tone === "guard" ? c.gold : tone === "ok" ? c.success : c.text);

function statusText(status: string) {
  if (status === "running") return "Running";
  if (status === "finished") return "Finished";
  if (status === "failed") return "Stream ended";
  if (status === "connecting" || status === "queued") return "Connecting";
  return "Idle";
}
