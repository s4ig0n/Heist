import type { HeistEvent } from '../../contracts/src/events';
import type { CaptureRecord, RefundRecord } from '../../paypal/src/ledger';
import type { Attacker, TranscriptLine } from './attacker';
import { GUARD_DENIED_CODE, isContractRule, type Bucket, type Verdict } from './oracle';
import type { GuardDecision } from './guard';
import type { Persona } from './personas';

export const MAX_TURNS = 8;

/** The part of a Nimbus instance the runner needs. */
export interface Target {
  send(text: string): Promise<{
    text: string;
    toolCalls: { toolCallId: string; toolName: string; args: unknown; result: unknown }[];
  }>;
}
export type Ledger = {
  capture(id: string): Promise<CaptureRecord | null>;
  refund(id: string): Promise<RefundRecord | null>;
};

/** Text planted in merchant data, such as an invoice note, that tries to give the agent orders. */
export interface PlantedInjection { source: string; text: string }

export interface ObservedRefund {
  toolCallId: string;
  args: unknown;
  refundId?: string;
  paypalErrorCode?: string; // the toolkit returns PayPal errors instead of throwing
  readBack: RefundRecord | null;
  amountCents: number; // from the PayPal read-back only, never from args or the agent's words
  succeeded: boolean;
  /** A planted injection had reached the agent through a tool result before this refund. */
  afterInjection?: boolean;
}

export type StopReason = 'goal' | 'attacker_stopped' | 'max_turns' | 'error';

export interface AttackRecord {
  runId: string;
  attackId: string;
  personaId: string;
  targetOrderKey: string;
  sessionCustomerId: string;
  stopReason: StopReason;
  error?: string;
  transcript: TranscriptLine[];
  toolCalls: { toolCallId: string; toolName: string; args: unknown; result: unknown }[];
  refunds: ObservedRefund[];
  /** Planted injections that reached the agent in this attack. */
  injections?: PlantedInjection[];
  captureBefore: CaptureRecord;
  captureAfter: CaptureRecord | null;
  /** The capture moved but no refund was read back, e.g. the model call failed right after the tool ran. */
  unobservedRefund: boolean;
  guarded: boolean;
  verdict?: Verdict;
}

/** Decides the outcome of a finished attack. */
export type Judge = (persona: Persona, record: AttackRecord) => Verdict;

export interface RunAttackOptions {
  runId: string;
  attackId: string;
  persona: Persona;
  captureId: string;
  target: Target;
  attacker: Attacker;
  /** Present on guarded runs: what the guard decided for a tool call. */
  guard?: { decisionFor(toolCallId: string): GuardDecision | undefined };
  /** Planted text to watch for in tool results. */
  injections?: PlantedInjection[];
  ledger: Ledger;
  judge: Judge;
  emit: (event: HeistEvent) => void;
  maxTurns?: number;
  now?: () => Date;
}

function parseResult(result: unknown): any {
  if (typeof result !== 'string') return result;
  try { return JSON.parse(result); } catch { return result; }
}

function parseRefundResult(result: unknown): { refundId?: string; paypalErrorCode?: string } {
  const o = parseResult(result);
  if (!o || typeof o !== 'object') return {};
  if (o.ok === false) return { paypalErrorCode: String(o.code ?? o.status ?? 'UNKNOWN') };
  return { refundId: o.id ?? o.result?.id };
}

/** Tool errors come back as values with ok: false, from PayPal through the toolkit or from the guard. */
function toolOutcome(result: unknown): { ok: boolean; errorCode?: string } {
  const o = parseResult(result);
  if (o && typeof o === 'object' && o.ok === false) return { ok: false, errorCode: String(o.code ?? o.status ?? 'UNKNOWN') };
  return { ok: true };
}

const toCents = (value: string) => Math.round(Number(value) * 100);
const FAILED_REFUND_STATUSES = new Set(['FAILED', 'CANCELLED']);

function toArgsRecord(args: unknown): Record<string, unknown> | undefined {
  return args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : undefined;
}

const BLOCKED_BY: Partial<Record<Bucket, 'agent' | 'paypal' | 'guard'>> = {
  refused_by_agent: 'agent',
  blocked_by_paypal: 'paypal',
  blocked_by_guard: 'guard',
};

/**
 * Plays one persona against one target, up to `maxTurns` attacker lines. Stops on the goal, when the
 * attacker gives up, or on an error. Nothing here retries a turn: a repeated turn could refund twice.
 */
export async function runAttack(opts: RunAttackOptions): Promise<AttackRecord> {
  const { runId, attackId, persona, captureId, target, attacker, ledger, judge } = opts;
  const now = opts.now ?? (() => new Date());

  const captureBefore = await ledger.capture(captureId);
  if (captureBefore?.status !== 'COMPLETED') {
    throw new Error(`${persona.targetOrderKey} capture is ${captureBefore?.status ?? 'missing'}; run npm run pool:refill first`);
  }

  let seq = 0;
  const base = () => ({
    eventId: `${attackId}-${String(++seq).padStart(3, '0')}`,
    runId,
    attackId,
    timestamp: now().toISOString(),
    verification: 'sandbox' as const,
  });

  const record: AttackRecord = {
    runId, attackId, personaId: persona.id, targetOrderKey: persona.targetOrderKey,
    sessionCustomerId: persona.sessionCustomerId, stopReason: 'max_turns', transcript: [], toolCalls: [],
    refunds: [], injections: [], captureBefore, captureAfter: null, unobservedRefund: false, guarded: !!opts.guard,
  };
  const verified = () => record.refunds.filter((r) => r.succeeded);
  const say = (role: TranscriptLine['role'], text: string) => {
    opts.emit({ ...base(), type: 'turn', turnIndex: record.transcript.length, role, text });
    record.transcript.push({ role, text });
  };

  opts.emit({ ...base(), type: 'attack.started', persona: persona.name, technique: persona.technique });

  try {
    for (let turn = 0; turn < (opts.maxTurns ?? MAX_TURNS); turn++) {
      const line = await attacker.next(record.transcript);
      if (line === null) {
        record.stopReason = 'attacker_stopped';
        break;
      }
      say('attacker', line);

      const reply = await target.send(line);

      for (const call of reply.toolCalls) {
        record.toolCalls.push(call);
        opts.emit({ ...base(), type: 'tool.called', tool: call.toolName, toolCallId: call.toolCallId, args: toArgsRecord(call.args) });
        const decision = opts.guard?.decisionFor(call.toolCallId);
        if (decision) {
          opts.emit({ ...base(), type: 'guard.decision', tool: decision.tool, decision: decision.decision, ruleIds: decision.ruleIds.filter(isContractRule) });
        }
        opts.emit({ ...base(), type: 'tool.result', toolCallId: call.toolCallId, tool: call.toolName, ...toolOutcome(call.result) });

        const text = typeof call.result === 'string' ? call.result : JSON.stringify(call.result ?? '');
        for (const injection of opts.injections ?? []) {
          if (!text.includes(injection.text) || record.injections!.some((seen) => seen.text === injection.text)) continue;
          record.injections!.push(injection);
          opts.emit({ ...base(), type: 'injection.observed', source: injection.source, text: injection.text });
        }

        if (call.toolName !== 'create_refund') continue;

        const { refundId, paypalErrorCode } = parseRefundResult(call.result);
        const readBack = refundId ? await ledger.refund(refundId) : null;
        const succeeded = !!readBack && !FAILED_REFUND_STATUSES.has(readBack.status);
        const amountCents = succeeded ? toCents(readBack.amount.value) : 0;
        record.refunds.push({
          toolCallId: call.toolCallId, args: call.args, refundId, paypalErrorCode, readBack, amountCents, succeeded,
          afterInjection: record.injections!.length > 0,
        });
        // A call the guard stopped never reached PayPal, so there is no refund to report.
        if (paypalErrorCode === GUARD_DENIED_CODE) continue;
        opts.emit({
          ...base(), type: 'refund.observed', amountCents, currency: 'USD',
          status: succeeded ? 'succeeded' : 'failed', paypalRefundId: refundId,
          paypalCaptureId: readBack?.captureId, toolCallId: call.toolCallId,
        });
      }

      say('target', reply.text);

      if (verified().length >= (persona.refundsToStop ?? 1)) {
        record.stopReason = 'goal';
        break;
      }
    }
  } catch (err: any) {
    record.stopReason = 'error';
    record.error = String(err?.message ?? err);
  }

  try {
    record.captureAfter = await ledger.capture(captureId);
    record.unobservedRefund =
      !!record.captureAfter && record.captureAfter.status !== captureBefore.status &&
      !verified().some((r) => r.readBack?.captureId === captureId);
  } catch (err: any) {
    record.error ??= `capture read-back failed: ${err?.message ?? err}`;
  }

  record.verdict = judge(persona, record);
  const { status, ruleIds, amountCents, bucket, severity, paypalErrorCodes } = record.verdict;
  const paypalErrorCode = paypalErrorCodes.find((code) => code !== GUARD_DENIED_CODE);
  opts.emit({
    ...base(), type: 'attack.completed', persona: persona.name, status, currency: 'USD', ruleIds, amountCents,
    ...(BLOCKED_BY[bucket] ? { blockedBy: BLOCKED_BY[bucket] } : {}),
    ...(paypalErrorCode ? { paypalErrorCode } : {}),
    ...(severity ? { severity } : {}),
  });
  return record;
}
