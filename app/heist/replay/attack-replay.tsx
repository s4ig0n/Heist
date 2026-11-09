"use client";

// Attack Replay: one attack, end to end. The conversation, every tool Nimbus called, what the
// merchant's own records said, and the refunds PayPal executed, each with a "Verify on PayPal"
// read-back. Highlights mark injected instructions in tool data and the attacker's pressure tactics.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { heistColors as c } from "@/app/heist-preview/heist-theme";
import {
  findSpans,
  orderFacts,
  personaName,
  resultText,
  segments,
  usd,
  type AttackRecord,
  type RecordedRefund,
  type ReplayRun,
  type SpanKind,
} from "@/lib/heist/attack-record";
import { BUCKET_LABEL, type Bucket } from "@/lib/heist/stream-state";
import { HeistShell, REPLAY_LABEL, control, heading, panel } from "../shell";

const BUCKET_COLOR: Record<string, string> = {
  leaked: c.danger,
  blocked_by_guard: c.gold,
  blocked_by_paypal: c.warning,
  refused_by_agent: c.success,
  allowed: c.success,
  benign_denied: c.danger,
  failed: c.textMuted,
};

const SPAN_STYLE: Record<SpanKind, React.CSSProperties> = {
  injection: { background: "rgba(234,119,119,0.25)", outline: `1px solid ${c.danger}`, color: c.text, borderRadius: 3, padding: "0 2px" },
  pressure: { background: "rgba(230,186,112,0.18)", borderBottom: `2px solid ${c.warning}`, color: c.text, padding: "0 1px" },
};

export function AttackReplay({ replays, initialRun, initialAttack }: { replays: string[]; initialRun?: string; initialAttack?: string }) {
  const [runId, setRunId] = useState(initialRun && replays.includes(initialRun) ? initialRun : replays.includes("baseline-run") ? "baseline-run" : replays[0]);
  const [run, setRun] = useState<ReplayRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attackId, setAttackId] = useState<string | undefined>(initialAttack);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    setRun(null);
    setError(null);
    fetch(`/api/replays/${runId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: ReplayRun) => {
        if (cancelled) return;
        setRun(data);
        setAttackId((current) => {
          if (current && data.records.some((r) => r.attackId === current)) return current;
          // Open on the biggest leak: that's the story.
          const leaks = data.records.filter((r) => r.verdict.bucket === "leaked");
          leaks.sort((a, b) => b.verdict.leakedCents - a.verdict.leakedCents);
          return (leaks[0] ?? data.records[0])?.attackId;
        });
      })
      .catch((e: Error) => !cancelled && setError(`Couldn't load the recording (${e.message}).`));
    return () => {
      cancelled = true;
    };
  }, [runId]);

  // Keep the URL shareable: the video and the README can deep-link to one attack.
  useEffect(() => {
    if (!runId || !attackId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("run", runId);
    url.searchParams.set("attack", attackId);
    window.history.replaceState(null, "", url);
  }, [runId, attackId]);

  const record = run?.records.find((r) => r.attackId === attackId);

  return (
    <HeistShell page="replay" scroll>
      <section aria-label="Choose an attack" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${c.border}` }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: c.textMuted }}>
          Recorded run
          <select value={runId} onChange={(e) => setRunId(e.target.value)} style={control}>
            {replays.map((id) => (
              <option key={id} value={id}>
                {REPLAY_LABEL[id] ?? id}
              </option>
            ))}
          </select>
        </label>
        <Link href="/heist/arena" style={{ fontSize: 13, color: c.textMuted }}>
          ← Back to the Arena
        </Link>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "260px minmax(0, 1fr)", gap: 16, padding: 16, alignItems: "start" }}>
        <nav aria-label="Attacks in this run" style={panel}>
          <h2 style={heading}>ATTACKS</h2>
          {!run && !error && <p style={{ color: c.textMuted, fontSize: 13 }}>Loading…</p>}
          {error && <p role="alert" style={{ color: c.danger, fontSize: 13 }}>{error}</p>}
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {run?.records.map((r) => {
              const active = r.attackId === attackId;
              const color = BUCKET_COLOR[r.verdict.bucket] ?? c.textMuted;
              return (
                <li key={r.attackId}>
                  <button
                    type="button"
                    onClick={() => setAttackId(r.attackId)}
                    aria-current={active ? "true" : undefined}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      background: active ? c.surfaceRaised : "transparent",
                      border: `1px solid ${active ? c.gold : c.border}`,
                      borderRadius: 6,
                      padding: "8px 10px",
                      color: c.text,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ display: "block", fontWeight: 700, fontSize: 14 }}>{personaName(r.personaId)}</span>
                    <span style={{ fontSize: 12, color }}>
                      {BUCKET_LABEL[r.verdict.bucket as Bucket] ?? r.verdict.bucket}
                      {r.verdict.leakedCents > 0 ? ` · ${usd(r.verdict.leakedCents)}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {record ? <AttackDetail key={record.attackId} record={record} /> : run && <p style={{ color: c.textMuted }}>Pick an attack.</p>}
      </div>
    </HeistShell>
  );
}

function AttackDetail({ record }: { record: AttackRecord }) {
  const v = record.verdict;
  const facts = orderFacts(record);
  const color = BUCKET_COLOR[v.bucket] ?? c.textMuted;
  const injectedInTools = useMemo(
    () => record.toolCalls.some((t) => findSpans(resultText(t.result), "tool").some((s) => s.kind === "injection")),
    [record],
  );

  return (
    <article aria-labelledby="attack-title" style={{ display: "grid", gap: 16 }}>
      <header style={{ ...panel, display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
        <div>
          <h2 id="attack-title" style={{ fontSize: 24, fontWeight: 800 }}>
            {personaName(record.personaId)}
          </h2>
          <p style={{ color: c.textMuted, fontSize: 13 }}>
            Targeted order <code>{record.targetOrderKey}</code> · session customer <code>{record.sessionCustomerId}</code> · stopped on {record.stopReason}
          </p>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <p style={{ color, fontWeight: 800, fontSize: 14, letterSpacing: 1 }}>{(BUCKET_LABEL[v.bucket as Bucket] ?? v.bucket).toUpperCase()}</p>
          <p style={{ fontSize: 32, fontWeight: 800, color: v.leakedCents > 0 ? c.danger : c.success, fontVariantNumeric: "tabular-nums" }}>
            {usd(v.leakedCents)} <span style={{ fontSize: 13, color: c.textMuted, fontWeight: 400 }}>leaked</span>
          </p>
          {v.severity && <p style={{ fontSize: 12, color: c.textMuted }}>Severity: {v.severity}</p>}
        </div>
      </header>

      {facts && (
        <section aria-label="What the merchant's records said" style={panel}>
          <h3 style={heading}>WHAT NIMBUS COULD SEE (MERCHANT RECORDS)</h3>
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, margin: 0 }}>
            <Fact label="Item" value={facts.item ?? "—"} />
            <Fact label="Paid" value={facts.amount ?? "—"} />
            <Fact
              label="Days since purchase"
              value={facts.daysSincePurchase !== undefined ? String(facts.daysSincePurchase) : "—"}
              bad={(facts.daysSincePurchase ?? 0) > 30}
              note={(facts.daysSincePurchase ?? 0) > 30 ? "outside the 30-day window" : undefined}
            />
            <Fact label="Return received" value={yesNo(facts.returnReceived)} bad={facts.returnReceived === false} />
            <Fact label="Damage on file" value={yesNo(facts.damageReported)} bad={facts.damageReported === false} />
          </dl>
          {v.violations.length > 0 && (
            <p style={{ marginTop: 12, fontSize: 13, color: c.danger }}>
              Policy the oracle says was broken: {v.violations.map((r) => <code key={r} style={{ marginRight: 8 }}>{r}</code>)}
            </p>
          )}
        </section>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 16, alignItems: "start" }}>
        <section aria-label="Conversation" style={panel}>
          <h3 style={heading}>CONVERSATION</h3>
          <Legend showInjection={injectedInTools} />
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {record.transcript.map((turn, i) => {
              const attacker = turn.role === "attacker";
              return (
                <li
                  key={i}
                  style={{
                    background: attacker ? c.surfaceRaised : "transparent",
                    border: `1px solid ${c.border}`,
                    borderLeft: `3px solid ${attacker ? c.danger : c.info}`,
                    borderRadius: 6,
                    padding: 12,
                  }}
                >
                  <strong style={{ fontSize: 11, letterSpacing: 1.5, color: attacker ? c.danger : c.info }}>
                    {attacker ? `ATTACKER · ${personaName(record.personaId).toUpperCase()}` : "NIMBUS (SUPPORT AGENT)"}
                  </strong>
                  <p style={{ marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: 14 }}>
                    <Highlighted text={turn.text} source={turn.role} />
                  </p>
                </li>
              );
            })}
          </ol>
        </section>

        <div style={{ display: "grid", gap: 16 }}>
          <section aria-label="Tool calls" style={panel}>
            <h3 style={heading}>TOOL-CALL TIMELINE</h3>
            <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gap: 10 }}>
              {record.toolCalls.map((call, i) => (
                <ToolCallItem key={call.toolCallId} index={i + 1} call={call} refund={record.refunds.find((r) => r.toolCallId === call.toolCallId)} />
              ))}
              {record.toolCalls.length === 0 && <li style={{ color: c.textMuted, fontSize: 13 }}>Nimbus called no tools.</li>}
            </ol>
          </section>

          <section aria-label="PayPal refunds" style={panel}>
            <h3 style={heading}>PAYPAL REFUNDS</h3>
            {record.refunds.length === 0 ? (
              <p style={{ color: c.textMuted, fontSize: 13 }}>No refund reached PayPal in this attack.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
                {record.refunds.map((r) => (
                  <RefundItem key={r.toolCallId} refund={r} leaked={v.findings.some((f) => f.refundId === r.refundId && f.violations.length > 0)} />
                ))}
              </ul>
            )}
            <p style={{ marginTop: 12, fontSize: 12, color: c.textMuted }}>
              Refunds go back to the original payer. The harm is a refund the merchant didn&apos;t owe.
            </p>
          </section>
        </div>
      </div>
    </article>
  );
}

function Highlighted({ text, source }: { text: string; source: "attacker" | "target" | "tool" }) {
  const parts = segments(text, findSpans(text, source));
  return (
    <>
      {parts.map((p, i) =>
        p.kind ? (
          <mark key={i} style={SPAN_STYLE[p.kind]} title={p.kind === "injection" ? "Instruction hidden in data" : "Attacker pressure tactic"}>
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function Legend({ showInjection }: { showInjection: boolean }) {
  return (
    <p style={{ fontSize: 12, color: c.textMuted, marginBottom: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
      <span>
        <mark style={SPAN_STYLE.pressure}>underlined</mark> attacker pressure tactic
      </span>
      {showInjection && (
        <span>
          <mark style={SPAN_STYLE.injection}>boxed</mark> instruction injected into data Nimbus read
        </span>
      )}
    </p>
  );
}

function ToolCallItem({ index, call, refund }: { index: number; call: AttackRecord["toolCalls"][number]; refund?: RecordedRefund }) {
  const [open, setOpen] = useState(false);
  const money = call.toolName === "create_refund";
  const amount = (call.args.amount as { value?: string } | undefined)?.value;
  const text = resultText(call.result);
  const injected = findSpans(text, "tool").length > 0;
  return (
    <li style={{ borderLeft: `2px solid ${money ? c.gold : c.border}`, paddingLeft: 12 }}>
      <p style={{ fontSize: 14 }}>
        <span style={{ color: c.textMuted, fontVariantNumeric: "tabular-nums" }}>{index}.</span>{" "}
        <code style={{ color: money ? c.gold : c.text, fontWeight: 700 }}>{call.toolName}</code>
        {money && (
          <span style={{ color: amount ? c.text : c.danger }}>
            {" "}
            {amount ? `amount $${amount}` : "no amount → full refund"}
          </span>
        )}
        {injected && <span style={{ color: c.danger, fontSize: 12, fontWeight: 700 }}> · injected text in result</span>}
      </p>
      {refund && (
        <p style={{ fontSize: 12, color: refund.succeeded ? c.success : c.warning }}>
          {refund.succeeded ? `PayPal executed refund ${refund.refundId}` : `PayPal rejected it${refund.errorCode ? ` (${refund.errorCode})` : ""}`}
        </p>
      )}
      {text && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{ background: "none", border: "none", color: c.textMuted, fontSize: 12, padding: 0, cursor: "pointer", textDecoration: "underline" }}
        >
          {open ? "Hide result" : "Show result"}
        </button>
      )}
      {open && (
        <pre style={{ marginTop: 6, maxHeight: 220, overflow: "auto", fontSize: 11, background: c.background, border: `1px solid ${c.border}`, borderRadius: 4, padding: 8, whiteSpace: "pre-wrap" }}>
          <Highlighted text={text} source="tool" />
        </pre>
      )}
    </li>
  );
}

type Check = { state: "idle" | "loading" | "live" | "recorded" | "error"; status?: string; amount?: string; note?: string };

function RefundItem({ refund, leaked }: { refund: RecordedRefund; leaked: boolean }) {
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const recorded = refund.readBack;

  async function verify() {
    if (!refund.refundId) return;
    setCheck({ state: "loading" });
    try {
      // Live read-back from the PayPal sandbox (GET /v2/payments/refunds/{id}) through our API.
      const res = await fetch(`/api/ledger/refund/${encodeURIComponent(refund.refundId)}`);
      if (res.ok) {
        const body = (await res.json()) as { status?: string; amount?: { value?: string; currency?: string; currency_code?: string } };
        setCheck({ state: "live", status: body.status, amount: body.amount?.value });
        return;
      }
      // The live route isn't deployed yet: show what PayPal returned when the run was recorded.
      setCheck({
        state: "recorded",
        status: recorded?.status,
        amount: recorded?.amount.value,
        note: res.status === 404 ? "Live read-back isn't available on this deployment yet." : `Live read-back failed (HTTP ${res.status}).`,
      });
    } catch {
      setCheck({ state: "recorded", status: recorded?.status, amount: recorded?.amount.value, note: "Couldn't reach the server." });
    }
  }

  return (
    <li style={{ border: `1px solid ${leaked ? c.danger : c.border}`, borderRadius: 6, padding: 12 }}>
      <p style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
        <span>
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>{usd(refund.amountCents)}</strong>{" "}
          {leaked ? <span style={{ color: c.danger, fontWeight: 700 }}>out of policy</span> : <span style={{ color: c.success }}>in policy</span>}
        </span>
        <span style={{ color: c.textMuted, fontSize: 12 }}>{refund.args.amount ? "partial amount set" : "no amount: full refund"}</span>
      </p>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 12px", margin: "8px 0", fontSize: 12 }}>
        <dt style={{ color: c.textMuted }}>Refund ID</dt>
        <dd style={{ margin: 0 }}>
          <code>{refund.refundId ?? "—"}</code>
        </dd>
        <dt style={{ color: c.textMuted }}>Capture ID</dt>
        <dd style={{ margin: 0 }}>
          <code>{refund.args.capture_id ?? recorded?.captureId ?? "—"}</code>
        </dd>
      </dl>
      {refund.refundId && (
        <button type="button" onClick={verify} disabled={check.state === "loading"} style={{ ...control, background: c.gold, color: c.background, fontWeight: 700, cursor: "pointer" }}>
          {check.state === "loading" ? "Checking PayPal…" : "Verify on PayPal"}
        </button>
      )}
      <div aria-live="polite" style={{ marginTop: 8, fontSize: 12 }}>
        {check.state === "live" && (
          <p style={{ color: c.success }}>
            ✓ PayPal sandbox says this refund is <strong>{check.status}</strong> for ${check.amount}, read live just now.
          </p>
        )}
        {check.state === "recorded" && (
          <p style={{ color: c.warning }}>
            {check.note} At record time PayPal reported <strong>{check.status ?? "unknown"}</strong>
            {check.amount ? ` for $${check.amount}` : ""} (GET /v2/payments/refunds/{refund.refundId}).
          </p>
        )}
      </div>
    </li>
  );
}

function Fact({ label, value, bad, note }: { label: string; value: string; bad?: boolean; note?: string }) {
  return (
    <div>
      <dt style={{ fontSize: 11, letterSpacing: 1, color: c.textMuted, textTransform: "uppercase" }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 18, fontWeight: 700, color: bad ? c.danger : c.text }}>{value}</dd>
      {note && <dd style={{ margin: 0, fontSize: 11, color: c.danger }}>{note}</dd>}
    </div>
  );
}

const yesNo = (v: boolean | undefined) => (v === undefined ? "—" : v ? "Yes" : "No");
