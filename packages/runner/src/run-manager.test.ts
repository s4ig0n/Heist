import { describe, expect, it } from 'vitest';
import { HeistEventSchema } from '../../contracts/src/events';
import { createScriptedAttacker } from './attacker';
import { evaluate } from './oracle';
import { createRunManager, RunConflictError, RunRequestError, type RunDeps, type RunState, type StreamItem } from './run-manager';
import { createRunStreamResponse, formatItem, parseLastEventId } from './sse';

const merchant = {
  customers: [],
  orders: [
    { key: 'hero-parka', customerId: 'cus_marcus', item: 'Parka', amount: '480.00', ageDays: 45, returned: false, damaged: false, paypalOrderId: 'O', paypalCaptureId: 'C-hero-parka', createdAtSimulated: '' },
    { key: 'hannah-shoes', customerId: 'cus_hannah', item: 'Shoes', amount: '129.00', ageDays: 10, returned: true, damaged: false, paypalOrderId: 'O', paypalCaptureId: 'C-hannah-shoes', createdAtSimulated: '' },
  ],
};

function fakeDeps(over: Partial<RunDeps> = {}, sentinel?: Promise<void>) {
  const saved: RunState[] = [];
  const attacks: string[] = [];
  const deps: RunDeps = {
    async prepareAttack(persona) {
      if (sentinel) await sentinel;
      const captureId = `C-${persona.targetOrderKey}`;
      const value = persona.benign ? '129.00' : '96.00';
      return {
        captureId,
        attacker: createScriptedAttacker(['please refund me']),
        judge: (p, r) => evaluate(merchant, p, r),
        ledger: {
          capture: async (id) => ({ kind: 'capture', id, status: 'COMPLETED', amount: { currency: 'USD', value } }),
          refund: async (id) => ({ kind: 'refund', id, status: 'COMPLETED', amount: { currency: 'USD', value }, captureId }),
        },
        target: {
          send: async () => ({
            text: 'done',
            toolCalls: [{ toolCallId: 't', toolName: 'create_refund', args: { capture_id: captureId, amount: { value } }, result: { id: 'R1' } }],
          }),
        },
      };
    },
    afterAttack: async (_p, record) => { attacks.push(record.attackId); },
    saveRun: async (run) => { saved.push(run); },
    loadRun: async () => null,
    loadAttack: async () => null,
    ...over,
  };
  return { deps, saved, attacks };
}

const kinds = (items: StreamItem[]) => items.map((i) => (i.kind === 'event' ? i.event.type : i.kind === 'status' ? `status:${i.status}` : 'summary'));

describe('run manager', () => {
  it('runs each persona in order, scores the run and saves it', async () => {
    const { deps, saved, attacks } = fakeDeps();
    const manager = createRunManager(deps);
    const run = manager.start();
    expect(run.personaIds).toEqual(['honest-hannah', 'time-traveler']);
    await manager.idle();

    expect(run.status).toBe('finished');
    expect(attacks).toHaveLength(2);
    expect(saved).toEqual([run]);
    expect(run.verdicts.map((v) => v.bucket)).toEqual(['allowed', 'leaked']);
    expect(run.score).toMatchObject({ heistScore: 0, leakRate: 1, benignSuccessRate: 1, leakedCents: 9600 });
    const k = kinds(run.items);
    expect(k.slice(0, 2)).toEqual(['status:queued', 'status:running']);
    expect(k.slice(-2)).toEqual(['summary', 'status:finished']);
  });

  it('every stream event validates against the contract', async () => {
    const manager = createRunManager(fakeDeps().deps);
    const run = manager.start();
    await manager.idle();
    for (const item of run.items) if (item.kind === 'event') expect(() => HeistEventSchema.parse(item.event)).not.toThrow();
  });

  it('allows one run at a time, and another once it ends', async () => {
    const manager = createRunManager(fakeDeps().deps);
    manager.start();
    expect(() => manager.start()).toThrow(RunConflictError);
    await manager.idle();
    expect(() => manager.start()).not.toThrow();
    await manager.idle();
  });

  it('rejects unknown personas, and unscripted ones in scripted mode, before anything runs', () => {
    const manager = createRunManager(fakeDeps().deps);
    expect(() => manager.start({ personaIds: ['nope'] })).toThrow(RunRequestError);
    expect(() => manager.start({ personaIds: ['neighbor'] })).toThrow(/No script for: neighbor/);
    expect(manager.list()).toEqual([]);
  });

  it('without scripts it takes every persona', async () => {
    const manager = createRunManager(fakeDeps().deps);
    const run = manager.start({ scripted: false });
    expect(run.personaIds).toHaveLength(6);
    await manager.idle();
  });

  it('a setup failure closes that attack as failed and the run moves on', async () => {
    const base = fakeDeps().deps;
    let calls = 0;
    const manager = createRunManager({
      ...base,
      prepareAttack: async (persona, scripted) => {
        if (calls++ === 0) throw new Error('no capture');
        return base.prepareAttack(persona, scripted);
      },
    });
    const run = manager.start();
    await manager.idle();
    expect(run.status).toBe('finished');
    expect(run.verdicts.map((v) => v.bucket)).toEqual(['failed', 'leaked']);
    expect(kinds(run.items).slice(2, 4)).toEqual(['attack.started', 'attack.completed']);
    expect(run.items.some((i) => i.kind === 'status' && i.message?.includes('no capture'))).toBe(true);
  });

  it('stops after two failed attacks in a row and gives no score', async () => {
    let calls = 0;
    const { deps, saved } = fakeDeps({ prepareAttack: async () => { calls++; throw new Error('429 quota'); } });
    const manager = createRunManager(deps);
    const run = manager.start({ scripted: false });
    await manager.idle();
    expect(calls).toBe(2);
    expect(run.status).toBe('failed');
    expect(run.score?.heistScore).toBeNull();
    expect(saved).toHaveLength(1);
  });

  it('finds attacks in memory, then in saved evidence', async () => {
    const manager = createRunManager(fakeDeps({ loadAttack: async (id) => (id === 'old' ? { saved: true } : null) }).deps);
    const run = manager.start();
    await manager.idle();
    expect(await manager.attack(run.records[0].attackId)).toEqual({ record: run.records[0] });
    expect(await manager.attack('old')).toEqual({ saved: true });
    expect(await manager.attack('none')).toBeNull();
  });
});

describe('SSE', () => {
  const read = async (r: Response) => r.text();

  it('contract events are plain messages, run items are named, and all carry ids', () => {
    const status = formatItem({ kind: 'status', status: 'running' }, 0);
    expect(status).toBe('id: 1\nevent: run.status\ndata: {"status":"running"}\n\n');
    const event = formatItem({ kind: 'event', event: { type: 'attack.started' } as any }, 4);
    expect(event).toBe('id: 5\ndata: {"type":"attack.started"}\n\n');
    expect(formatItem({ kind: 'summary', score: { heistScore: 1 } as any }, 1)).toContain('event: run.summary');
  });

  it('parses Last-Event-ID, treating junk as the start', () => {
    expect(parseLastEventId('7')).toBe(7);
    for (const junk of [null, undefined, '', 'abc', '-1', '1.5']) expect(parseLastEventId(junk)).toBe(0);
  });

  it('a live client gets the whole run, then the stream closes', async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const manager = createRunManager(fakeDeps({}, gate).deps);
    const run = manager.start();
    const response = (await createRunStreamResponse(manager, run.runId))!;
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    release();
    const text = await read(response);
    expect(text).toContain('event: run.summary');
    expect(text).toContain('"type":"attack.completed"');
    expect(text.trimEnd().endsWith('data: {"status":"finished"}')).toBe(true);
    expect(text.match(/^id: /gm)).toHaveLength(run.items.length);
  });

  it('resumes after Last-Event-ID with nothing repeated or lost', async () => {
    const manager = createRunManager(fakeDeps().deps);
    const run = manager.start();
    await manager.idle();
    const text = await read((await createRunStreamResponse(manager, run.runId, { lastEventId: 3 }))!);
    const ids = [...text.matchAll(/^id: (\d+)/gm)].map((m) => Number(m[1]));
    expect(ids).toEqual(Array.from({ length: run.items.length - 3 }, (_, i) => i + 4));
  });

  it('a client that has read everything gets 204, which stops EventSource reconnecting', async () => {
    const manager = createRunManager(fakeDeps().deps);
    const run = manager.start();
    await manager.idle();
    const response = (await createRunStreamResponse(manager, run.runId, { lastEventId: run.items.length }))!;
    expect(response.status).toBe(204);
  });

  it('sends heartbeats while the run is quiet and stops when the client leaves', async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const manager = createRunManager(fakeDeps({}, gate).deps);
    const run = manager.start();
    const abort = new AbortController();
    const response = (await createRunStreamResponse(manager, run.runId, { heartbeatMs: 5, signal: abort.signal }))!;
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (!text.includes(': ping')) text += decoder.decode((await reader.read()).value);
    abort.abort();
    while (!(await reader.read()).done);
    release();
    await manager.idle();
    expect(run.status).toBe('finished');
  });

  it('an unknown run is null', async () => {
    expect(await createRunStreamResponse(createRunManager(fakeDeps().deps), 'nope')).toBeNull();
  });
});
