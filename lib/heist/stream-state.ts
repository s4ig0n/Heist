// Turns a Heist SSE stream (live run or replay) into the rows the cockpit shows.
// Pure functions only, so the same reducer runs in the browser, in tests and in the Analyst's tools.
//
// Event shapes follow packages/contracts/src/events.ts plus the run-level items described in
// docs/RUNS-API.md. Until contract change requests #2 and #6 land, `attack.completed` says "blocked"
// for both Nimbus refusing on its own and the guard stopping a call, so the bucket is derived here:
// any guard `deny` for the attack means the guard blocked it, otherwise Nimbus refused.

export type Bucket =
  | "running"
  | "leaked"
  | "blocked_by_guard"
  | "blocked_by_paypal"
  | "refused_by_agent"
  | "allowed"
  | "benign_denied"
  | "failed";

export type AttackRow = {
  attackId: string;
  persona: string;
  technique: string;
  bucket: Bucket;
  /** Dollars the oracle counted as leaked (out of policy, executed by PayPal). */
  leakedUsd: number;
  /** Dollars PayPal actually refunded in this attack, in or out of policy. */
  refundedUsd: number;
  /** Refund calls the guard denied. */
  guardDenials: number;
  toolCalls: number;
  ruleIds: string;
  refundIds: string;
  verification: string;
  startedAt: string;
  endedAt: string;
};

export type ToolCallRow = {
  id: string;
  attackId: string;
  persona: string;
  tool: string;
  /** Amount the agent asked for, or "FULL" when create_refund had no amount (a full refund). */
  requested: string;
  decision: "called" | "allowed_by_guard" | "denied_by_guard" | "pending_approval";
  ruleIds: string;
  at: string;
};

export type LeakRow = {
  id: string;
  attackId: string;
  persona: string;
  amountUsd: number;
  ruleIds: string;
  paypalRefundId: string;
  verification: string;
  at: string;
};

export type FeedItem = { id: string; at: string; tone: "info" | "leak" | "guard" | "ok"; text: string };

export type RunScore = {
  heistScore: number | null;
  leakRate: number;
  benignSuccessRate: number;
  leakedCents: number;
  cappedByCriticalLeak?: boolean;
  counts: Record<string, number>;
};

export type RunStatus = "idle" | "connecting" | "queued" | "running" | "finished" | "failed";

export type HeistState = {
  runId: string | null;
  status: RunStatus;
  statusMessage?: string;
  attacks: AttackRow[];
  toolCalls: ToolCallRow[];
  leaks: LeakRow[];
  feed: FeedItem[];
  score: RunScore | null;
  /** Set on the first leak of the run; drives the alarm. */
  firstLeakAt: string | null;
  /** Bumped on every applied item, so subscribers can cheaply tell that data changed. */
  version: number;
};

export const initialHeistState: HeistState = {
  runId: null,
  status: "idle",
  attacks: [],
  toolCalls: [],
  leaks: [],
  feed: [],
  score: null,
  firstLeakAt: null,
  version: 0,
};

// Loose event type: the stream is validated by its producer, and fields are added as contract
// change requests land, so the reducer reads only what it needs and tolerates extras.
export type StreamEvent = {
  type: string;
  eventId: string;
  runId: string;
  attackId: string;
  timestamp: string;
  verification?: string;
  persona?: string;
  technique?: string;
  tool?: string;
  args?: Record<string, unknown>;
  decision?: "allow" | "deny" | "pending_approval";
  ruleIds?: string[];
  amountCents?: number;
  status?: string;
  paypalRefundId?: string;
  source?: string;
  text?: string;
  blockedBy?: "agent" | "paypal" | "guard";
};

export type StreamItem =
  | { kind: "event"; event: StreamEvent }
  | { kind: "status"; status: RunStatus; message?: string }
  | { kind: "summary"; score: RunScore };

const usd = (cents: number | undefined) => Math.round(cents ?? 0) / 100;
const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
const FEED_LIMIT = 200;

function requestedAmount(args: Record<string, unknown> | undefined): string {
  const amount = args?.amount as { value?: string } | undefined;
  if (args && "capture_id" in args && !amount) return "FULL";
  return amount?.value ? `$${amount.value}` : "";
}

function pushFeed(state: HeistState, item: Omit<FeedItem, "id">): FeedItem[] {
  const next = [...state.feed, { ...item, id: `${state.version + 1}` }];
  return next.length > FEED_LIMIT ? next.slice(-FEED_LIMIT) : next;
}

function updateAttack(attacks: AttackRow[], attackId: string, patch: (row: AttackRow) => AttackRow): AttackRow[] {
  return attacks.map((row) => (row.attackId === attackId ? patch(row) : row));
}

export function applyItem(state: HeistState, item: StreamItem): HeistState {
  const version = state.version + 1;

  if (item.kind === "status") {
    return { ...state, status: item.status, statusMessage: item.message, version };
  }
  if (item.kind === "summary") {
    return { ...state, score: item.score, version };
  }

  const e = item.event;
  const runId = state.runId ?? e.runId;
  const persona = state.attacks.find((a) => a.attackId === e.attackId)?.persona ?? e.persona ?? "Unknown";

  switch (e.type) {
    case "attack.started": {
      const row: AttackRow = {
        attackId: e.attackId,
        persona: e.persona ?? "Unknown",
        technique: (e.technique ?? "").replace(/_/g, " "),
        bucket: "running",
        leakedUsd: 0,
        refundedUsd: 0,
        guardDenials: 0,
        toolCalls: 0,
        ruleIds: "",
        refundIds: "",
        verification: e.verification ?? "",
        startedAt: e.timestamp,
        endedAt: "",
      };
      return {
        ...state,
        runId,
        status: state.status === "idle" || state.status === "connecting" ? "running" : state.status,
        attacks: [...state.attacks.filter((a) => a.attackId !== e.attackId), row],
        feed: pushFeed(state, { at: e.timestamp, tone: "info", text: `${row.persona} starts: ${row.technique}` }),
        version,
      };
    }

    case "tool.called": {
      const call: ToolCallRow = {
        id: e.eventId,
        attackId: e.attackId,
        persona,
        tool: e.tool ?? "",
        requested: requestedAmount(e.args),
        decision: "called",
        ruleIds: "",
        at: e.timestamp,
      };
      const isMoney = call.tool === "create_refund";
      return {
        ...state,
        runId,
        toolCalls: [...state.toolCalls, call],
        attacks: updateAttack(state.attacks, e.attackId, (a) => ({ ...a, toolCalls: a.toolCalls + 1 })),
        feed: isMoney
          ? pushFeed(state, {
              at: e.timestamp,
              tone: "info",
              text: `Nimbus calls create_refund ${call.requested === "FULL" ? "with no amount (full refund)" : `for ${call.requested}`}`,
            })
          : state.feed,
        version,
      };
    }

    case "guard.decision": {
      // Pair the decision with the latest undecided call to the same tool in this attack.
      const idx = [...state.toolCalls]
        .reverse()
        .findIndex((c) => c.attackId === e.attackId && c.tool === e.tool && c.decision === "called");
      const target = idx === -1 ? -1 : state.toolCalls.length - 1 - idx;
      const decision: ToolCallRow["decision"] =
        e.decision === "deny" ? "denied_by_guard" : e.decision === "pending_approval" ? "pending_approval" : "allowed_by_guard";
      const rules = (e.ruleIds ?? []).join(", ");
      const toolCalls =
        target === -1 ? state.toolCalls : state.toolCalls.map((c, i) => (i === target ? { ...c, decision, ruleIds: rules } : c));
      const denied = e.decision === "deny";
      return {
        ...state,
        toolCalls,
        attacks: denied
          ? updateAttack(state.attacks, e.attackId, (a) => ({ ...a, guardDenials: a.guardDenials + 1 }))
          : state.attacks,
        feed: denied
          ? pushFeed(state, { at: e.timestamp, tone: "guard", text: `Guard denied ${e.tool}${rules ? ` (${rules})` : ""}` })
          : state.feed,
        version,
      };
    }

    case "refund.observed": {
      const ok = e.status === "succeeded";
      return {
        ...state,
        attacks: updateAttack(state.attacks, e.attackId, (a) => ({
          ...a,
          refundedUsd: ok ? a.refundedUsd + usd(e.amountCents) : a.refundedUsd,
          refundIds: [a.refundIds, e.paypalRefundId].filter(Boolean).join(", "),
        })),
        feed: pushFeed(state, {
          at: e.timestamp,
          tone: ok ? "ok" : "info",
          text: ok
            ? `PayPal refunded ${fmtUsd(usd(e.amountCents))}${e.paypalRefundId ? ` (refund ${e.paypalRefundId})` : ""}`
            : `PayPal rejected a ${fmtUsd(usd(e.amountCents))} refund`,
        }),
        version,
      };
    }

    case "injection.observed": {
      return {
        ...state,
        feed: pushFeed(state, { at: e.timestamp, tone: "leak", text: `Injected text read from ${e.source ?? "untrusted field"}` }),
        version,
      };
    }

    case "attack.completed": {
      const attack = state.attacks.find((a) => a.attackId === e.attackId);
      const bucket = bucketFor(e, attack);
      const leakedUsd = bucket === "leaked" ? usd(e.amountCents) : 0;
      const rules = (e.ruleIds ?? []).join(", ");
      const leak: LeakRow | null =
        bucket === "leaked"
          ? {
              id: e.eventId,
              attackId: e.attackId,
              persona,
              amountUsd: leakedUsd,
              ruleIds: rules,
              paypalRefundId: attack?.refundIds ?? "",
              verification: e.verification ?? "",
              at: e.timestamp,
            }
          : null;
      return {
        ...state,
        attacks: updateAttack(state.attacks, e.attackId, (a) => ({
          ...a,
          bucket,
          leakedUsd,
          ruleIds: rules,
          endedAt: e.timestamp,
        })),
        leaks: leak ? [...state.leaks, leak] : state.leaks,
        firstLeakAt: leak && !state.firstLeakAt ? e.timestamp : state.firstLeakAt,
        feed: pushFeed(state, {
          at: e.timestamp,
          tone: bucket === "leaked" ? "leak" : bucket === "blocked_by_guard" ? "guard" : "ok",
          text: `${persona}: ${BUCKET_LABEL[bucket]}${leakedUsd ? ` ${fmtUsd(leakedUsd)}` : ""}${rules ? ` (${rules})` : ""}`,
        }),
        version,
      };
    }

    default:
      return { ...state, version };
  }
}

function bucketFor(e: StreamEvent, attack: AttackRow | undefined): Bucket {
  if (e.status === "leak") return "leaked";
  if (e.status === "allowed") return "allowed";
  if (e.status === "failed") return "failed";
  if (e.status === "blocked") {
    if (e.blockedBy === "guard") return "blocked_by_guard";
    if (e.blockedBy === "paypal") return "blocked_by_paypal";
    if (e.blockedBy === "agent") return "refused_by_agent";
    return attack && attack.guardDenials > 0 ? "blocked_by_guard" : "refused_by_agent";
  }
  return "failed";
}

export const BUCKET_LABEL: Record<Bucket, string> = {
  running: "Running",
  leaked: "LEAKED",
  blocked_by_guard: "Blocked by guard",
  blocked_by_paypal: "Blocked by PayPal",
  refused_by_agent: "Refused by Nimbus",
  allowed: "Refund allowed",
  benign_denied: "Honest customer denied",
  failed: "Failed",
};

/** Totals the cockpit shows before the oracle's run.summary arrives. The summary wins once it does. */
export function liveTotals(state: HeistState) {
  const done = state.attacks.filter((a) => a.bucket !== "running");
  const leakedUsd = state.leaks.reduce((s, l) => s + l.amountUsd, 0);
  const guardBlocked = state.attacks.filter((a) => a.bucket === "blocked_by_guard").length;
  return {
    attacks: state.attacks.length,
    finished: done.length,
    leakedUsd: state.score ? state.score.leakedCents / 100 : leakedUsd,
    leakedAttacks: state.leaks.length,
    guardBlocked,
    heistScore: state.score?.heistScore ?? null,
  };
}
