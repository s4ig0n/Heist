import { describe, expect, it } from 'vitest';
import { HeistEventSchema } from '../../contracts/src/events';
import { createScriptedAttacker } from './attacker';
import { evaluate } from './oracle';
import { PERSONAS } from './personas';
import { createRunManager, RunConflictError, RunRequestError, type RunDeps, type RunState, type StreamItem } from './run-manager';
import { createReplayResponse, createRunStreamResponse, formatItem, parseLastEventId, replayDelayMs } from './sse';

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

  it('passes the guarded flag through, off unless asked for', async () => {
    const seen: boolean[] = [];
    const base = fakeDeps().deps;
    const manager = createRunManager({ ...base, prepareAttack: (p, s, g) => { seen.push(g); return base.prepareAttack(p, s, g); } });
    expect(manager.start({ personaIds: ['time-traveler'] }).guarded).toBe(false);
    await manager.idle();
    expect(manager.start({ personaIds: ['time-traveler'], guarded: true }).guarded).toBe(true);
    await manager.idle();
    expect(seen).toEqual([false, true]);
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

  it('rejects unknown personas before anything runs', () => {
    const manager = createRunManager(fakeDeps().deps);
    expect(() => manager.start({ personaIds: ['nope'] })).toThrow(RunRequestError);
    expect(manager.list()).toEqual([]);
  });

  it('without scripts it takes every persona', async () => {
    const manager = createRunManager(fakeDeps().deps);
    const run = manager.start({ scripted: false });
    expect(run.personaIds).toHaveLength(PERSONAS.length);
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

describe('replay', () => {
  const event = (timestamp: string, n: number): StreamItem => ({ kind: 'event', event: { type: 'attack.started', eventId: `e${n}`, timestamp } as any });
  const items: StreamItem[] = [
    { kind: 'status', status: 'running' },
    event('2026-11-07T00:00:00.000Z', 1),
    event('2026-11-07T00:00:00.500Z', 2),
    event('2026-11-07T00:03:00.000Z', 3),
    { kind: 'status', status: 'finished' },
  ];

  it('keeps short gaps and caps long ones, scaled by speed', () => {
    expect(replayDelayMs(items, 2, 1)).toBe(500);
    expect(replayDelayMs(items, 3, 1)).toBe(2000);
    expect(replayDelayMs(items, 3, 4)).toBe(500);
    expect(replayDelayMs(items, 1, 1)).toBe(300); // nothing before it to measure from
    expect(replayDelayMs(items, 4, 1)).toBe(300);
  });
  it('plays everything in order, then says it finished', async () => {
    const text = await createReplayResponse({ items }, { speed: 1000 }).text();
    expect([...text.matchAll(/^id: (\d+)/gm)].map((m) => Number(m[1]))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(text.trimEnd().endsWith('event: replay.finished\ndata: {}')).toBe(true);
  });
  it('resumes from Last-Event-ID, and 204s once it has all been seen', async () => {
    const text = await createReplayResponse({ items }, { speed: 1000, lastEventId: 3 }).text();
    expect([...text.matchAll(/^id: (\d+)/gm)].map((m) => Number(m[1]))).toEqual([4, 5, 6]);
    expect(createReplayResponse({ items }, { lastEventId: 6 }).status).toBe(204);
  });
});
