import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Merchant } from '../../nimbus/src/merchant';
import { createGuard } from './guard';
import { generatePatch, patchIdFor, runIdFromPatchId } from './patch';

const verdict = (violations: string[]) => ({ violations }) as any;
const run = (rows: [string, string[]][]) => ({
  runId: 'run-1', scripted: true, personaIds: rows.map(([p]) => p), verdicts: rows.map(([, v]) => verdict(v)),
});

describe('generatePatch', () => {
  it('turns on only the rules a leak broke, and says who broke them', () => {
    const patch = generatePatch(run([
      ['honest-hannah', []],
      ['time-traveler', ['refund.window_days', 'refund.requires_evidence']],
      ['slow-burn', ['refund.window_days']],
    ]))!;
    expect(patch.changes).toEqual([
      { ruleId: 'refund.requires_evidence', enabled: { from: false, to: true }, because: ['time-traveler'] },
      { ruleId: 'refund.window_days', enabled: { from: false, to: true }, because: ['time-traveler', 'slow-burn'] },
    ]);
    expect(patch.after.rules['refund.window_days'].enabled).toBe(true);
    expect(patch.after.rules['refund.ownership'].enabled).toBe(false);
    expect(Object.values(patch.before.rules).every((r) => !r.enabled)).toBe(true);
  });
  it('keeps the thresholds', () => {
    const patch = generatePatch(run([['a', ['refund.window_days']]]))!;
    expect(patch.after.rules['refund.window_days'].days).toBe(30);
  });
  it('is the same every time', () => {
    const input = run([['a', ['refund.max_ratio', 'refund.ownership']], ['b', ['refund.ownership']]]);
    expect(generatePatch(input)).toEqual(generatePatch(input));
  });
  it('a run with no leaks has nothing to patch', () => {
    expect(generatePatch(run([['a', []]]))).toBeNull();
  });
  it('carries the personas and mode for the rerun', () => {
    expect(generatePatch(run([['a', ['refund.ownership']], ['b', []]]))).toMatchObject({
      patchId: 'patch-run-1', fromRunId: 'run-1', personaIds: ['a', 'b'], scripted: true,
    });
  });
  it('a recording can name the patch', () => {
    expect(generatePatch(run([['a', ['refund.ownership']]]), 'baseline-run')?.patchId).toBe('patch-baseline-run');
  });
  it('patch ids round trip, and other ids are rejected', () => {
    expect(runIdFromPatchId(patchIdFor('baseline-run'))).toBe('baseline-run');
    expect(runIdFromPatchId('run-1')).toBeNull();
  });
});

describe('the recorded baseline', () => {
  const load = (p: string) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'));
  const baseline = load('../../fixtures/recorded/baseline-run.json');
  const merchant: Merchant = load('../../../data/merchant.json');

  it('gives a patch covering exactly its three broken rules', () => {
    const patch = generatePatch(baseline)!;
    expect(patch.changes.map((c) => c.ruleId)).toEqual(['refund.one_per_capture', 'refund.requires_evidence', 'refund.window_days']);
  });

  it('the patched guard still lets Hannah through and stops the $96 parka refund', async () => {
    const { after } = generatePatch(baseline)!;
    const attempt = async (key: string, sessionCustomerId: string, value: string) => {
      const order = merchant.orders.find((o) => o.key === key)!;
      const guard = createGuard({
        merchant, sessionCustomerId, config: after,
        ledger: { capture: async (id) => ({ kind: 'capture', id, status: 'COMPLETED', amount: { currency: 'USD', value: order.amount } }) },
      });
      let reachedPayPal = false;
      const tools: any = guard.wrap({ create_refund: { execute: async () => { reachedPayPal = true; return {}; } } });
      await tools.create_refund.execute({ capture_id: order.paypalCaptureId, amount: { currency_code: 'USD', value } }, { toolCallId: 't' });
      return reachedPayPal;
    };
    expect(await attempt('hannah-shoes', 'cus_hannah', '129.00')).toBe(true);
    expect(await attempt('hero-parka', 'cus_marcus', '96.00')).toBe(false);
  });
});
