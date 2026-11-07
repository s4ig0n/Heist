import { HeistEventSchema, type HeistEvent } from '../../contracts/src/events';
import type { Attacker } from './attacker';
import { DEFAULT_GUARD_RULES, type Guard, type GuardConfig } from './guard';
import { failedVerdict, scoreRun, type RunScore, type Verdict } from './oracle';
import { DEFAULT_PERSONA_IDS, getPersona, PERSONAS, type Persona } from './personas';
import { runAttack, type AttackRecord, type Judge, type Ledger, type Target } from './run-attack';

export type RunStatus = 'queued' | 'running' | 'finished' | 'failed';

/** What a stream carries, in order. Run-level items aren't contract events (change request #5). */
export type StreamItem =
  | { kind: 'event'; event: HeistEvent }
  | { kind: 'status'; status: RunStatus; message?: string }
  | { kind: 'summary'; score: RunScore };

export interface RunState {
  runId: string;
  status: RunStatus;
  personaIds: string[];
  scripted: boolean;
  guarded: boolean;
  guardRules: GuardConfig | null;
  patchId?: string;
  startedAt: string;
  finishedAt?: string;
  items: StreamItem[];
  verdicts: Verdict[];
  records: AttackRecord[];
  score?: RunScore;
}

export interface PreparedAttack {
  captureId: string;
  target: Target;
  attacker: Attacker;
  ledger: Ledger;
  judge: Judge;
  guard?: Guard;
}

export interface RunDeps {
  /** Readies one attack, including a fresh capture for its target order. */
  prepareAttack(persona: Persona, scripted: boolean, guardRules: GuardConfig | null): Promise<PreparedAttack>;
  /** Called after each attack that ran, whatever its outcome. */
  afterAttack(persona: Persona, record: AttackRecord, events: HeistEvent[], scripted: boolean): Promise<void>;
  saveRun(run: RunState): Promise<void>;
  loadRun(runId: string): Promise<RunState | null>;
  loadAttack(attackId: string): Promise<unknown | null>;
}

/** A second broken attack in a row usually means quota or an outage, so stop spending on the rest. */
const MAX_CONSECUTIVE_FAILURES = 2;

export class RunConflictError extends Error {}
export class RunRequestError extends Error {}
export class RunLimitError extends Error {}

export type RunListener = (item: StreamItem, index: number) => void;

export interface StartOptions {
  personaIds?: string[];
  scripted?: boolean;
  guarded?: boolean; // the full rule set
  guardRules?: GuardConfig; // a specific rule set, such as a patch
  patchId?: string;
}

export function createRunManager(deps: RunDeps, now: () => Date = () => new Date(), limits: { maxRunsPerDay?: number } = {}) {
  const runs = new Map<string, RunState>();
  const listeners = new Map<string, Set<RunListener>>();
  let active: Promise<void> | null = null;

  const publish = (run: RunState, item: StreamItem) => {
    run.items.push(item);
    for (const listener of listeners.get(run.runId) ?? []) listener(item, run.items.length - 1);
  };
  const setStatus = (run: RunState, status: RunStatus, message?: string) => {
    run.status = status;
    publish(run, { kind: 'status', status, ...(message ? { message } : {}) });
  };

  async function runOne(run: RunState, persona: Persona, attackId: string) {
    const events: HeistEvent[] = [];
    const emit = (event: HeistEvent) => {
      const parsed = HeistEventSchema.parse(event);
      events.push(parsed);
      publish(run, { kind: 'event', event: parsed });
    };
    try {
      const prepared = await deps.prepareAttack(persona, run.scripted, run.guardRules);
      const record = await runAttack({ runId: run.runId, attackId, persona, emit, ...prepared });
      run.records.push(record);
      await deps.afterAttack(persona, record, events, run.scripted);
      return record.verdict!;
    } catch (err) {
      // Nothing ran, or the attack couldn't finish. Say so, so the UI isn't left with an open attack.
      const verdict = failedVerdict(persona);
      const base = { runId: run.runId, attackId, timestamp: now().toISOString(), verification: 'sandbox' as const };
      if (!events.length) {
        emit({ ...base, eventId: `${attackId}-setup-started`, type: 'attack.started', persona: persona.name, technique: persona.technique });
      }
      emit({
        ...base, eventId: `${attackId}-setup-failed`, type: 'attack.completed', persona: persona.name,
        status: 'failed', amountCents: 0, currency: 'USD', ruleIds: [],
      });
      publish(run, { kind: 'status', status: 'running', message: `${persona.id}: ${String((err as Error)?.message ?? err)}` });
      return verdict;
    }
  }

  async function execute(run: RunState, personas: Persona[]) {
    setStatus(run, 'running');
    let consecutiveFailures = 0;
    let stoppedEarly = false;
    for (const persona of personas) {
      const stamp = now().toISOString().replace(/[:.]/g, '-');
      const verdict = await runOne(run, persona, `${persona.id}-${stamp}`);
      run.verdicts.push(verdict);
      consecutiveFailures = verdict.bucket === 'failed' ? consecutiveFailures + 1 : 0;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        stoppedEarly = true;
        break;
      }
    }
    run.score = scoreRun(run.verdicts);
    run.finishedAt = now().toISOString();
    publish(run, { kind: 'summary', score: run.score });
    if (stoppedEarly) setStatus(run, 'failed', `Stopped after ${MAX_CONSECUTIVE_FAILURES} failed attacks in a row`);
    else setStatus(run, 'finished');
    await deps.saveRun(run).catch((err) => console.error('Could not save run', run.runId, err));
  }

  return {
    /** Starts a run in the background. One at a time: runs spend real sandbox captures and model quota. */
    start(opts: StartOptions = {}): RunState {
      if (active) throw new RunConflictError('A run is already in progress');
      const today = now().toISOString().slice(0, 10);
      const startedToday = [...runs.values()].filter((r) => r.startedAt.startsWith(today)).length;
      if (limits.maxRunsPerDay !== undefined && startedToday >= limits.maxRunsPerDay) {
        throw new RunLimitError(`The limit of ${limits.maxRunsPerDay} runs a day has been reached`);
      }
      const scripted = opts.scripted ?? true;
      let personas: Persona[];
      try {
        personas = opts.personaIds?.length
          ? opts.personaIds.map(getPersona)
          : scripted ? DEFAULT_PERSONA_IDS.map(getPersona) : PERSONAS;
      } catch (err) {
        throw new RunRequestError((err as Error).message);
      }

      const guardRules = opts.guardRules ?? (opts.guarded ? DEFAULT_GUARD_RULES : null);
      const startedAt = now();
      const run: RunState = {
        runId: `run-${startedAt.toISOString().replace(/[:.]/g, '-')}`, status: 'queued',
        personaIds: personas.map((p) => p.id), scripted, guarded: !!guardRules, guardRules, patchId: opts.patchId, startedAt: startedAt.toISOString(), items: [], verdicts: [], records: [],
      };
      runs.set(run.runId, run);
      publish(run, { kind: 'status', status: 'queued' });
      active = execute(run, personas)
        .catch((err) => {
          console.error('Run failed', run.runId, err);
          run.finishedAt = now().toISOString();
          setStatus(run, 'failed', String(err?.message ?? err));
        })
        .finally(() => { active = null; });
      return run;
    },

    async get(runId: string): Promise<RunState | null> {
      return runs.get(runId) ?? (await deps.loadRun(runId));
    },

    list(): RunState[] {
      return [...runs.values()].reverse();
    },

    async attack(attackId: string): Promise<unknown | null> {
      for (const run of runs.values()) {
        const record = run.records.find((r) => r.attackId === attackId);
        if (record) return { record };
      }
      return deps.loadAttack(attackId);
    },

    /** Calls back for each new item. Returns the function that stops it. */
    subscribe(runId: string, listener: RunListener): () => void {
      const set = listeners.get(runId) ?? new Set<RunListener>();
      listeners.set(runId, set);
      set.add(listener);
      return () => set.delete(listener);
    },

    /** Resolves when the current run is over. */
    idle(): Promise<void> {
      return active ?? Promise.resolve();
    },
  };
}

export type RunManager = ReturnType<typeof createRunManager>;
export const isOver = (status: RunStatus) => status === 'finished' || status === 'failed';
