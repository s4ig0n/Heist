import { describe, expect, it } from 'vitest';
import type { RefundRecord } from '../../paypal/src/ledger';
import type { ObservedRefund } from './run-attack';
import { compareRefund, normalizeEvidence, withLedgerRefunds } from './verify-evidence';

const paypal = (over: Partial<RefundRecord> = {}): RefundRecord => ({
  kind: 'refund', id: 'R1', status: 'COMPLETED', amount: { currency: 'USD', value: '96.00' }, captureId: 'C1', ...over,
});
const saved: ObservedRefund = { toolCallId: 't', args: {}, refundId: 'R1', readBack: paypal(), amountCents: 9600, succeeded: true };

describe('compareRefund', () => {
  it('passes when PayPal agrees', () => {
    expect(compareRefund(saved, paypal())).toEqual([]);
  });
  it('catches a refund PayPal does not have', () => {
    expect(compareRefund(saved, null)).toEqual(['not found on PayPal']);
  });
  it('catches a different amount, capture or status', () => {
    expect(compareRefund(saved, paypal({ amount: { currency: 'USD', value: '480.00' } }))[0]).toMatch(/amount/);
    expect(compareRefund(saved, paypal({ captureId: 'C2' }))[0]).toMatch(/capture/);
    expect(compareRefund(saved, paypal({ status: 'FAILED' }))[0]).toMatch(/status/);
  });
});

describe('withLedgerRefunds', () => {
  const record = { refunds: [saved] } as any;
  it('uses what PayPal says now, not what was saved', () => {
    const fresh = withLedgerRefunds(record, new Map([['R1', paypal({ amount: { currency: 'USD', value: '1.00' } })]]));
    expect(fresh.refunds[0].amountCents).toBe(100);
  });
  it('a refund PayPal lost counts for nothing', () => {
    expect(withLedgerRefunds(record, new Map([['R1', null]])).refunds[0]).toMatchObject({ succeeded: false, amountCents: 0 });
  });
  it('leaves refunds it did not re-read alone', () => {
    expect(withLedgerRefunds(record, new Map()).refunds[0]).toBe(saved);
  });
});

describe('normalizeEvidence', () => {
  it('passes the current format through', () => {
    const record = { attackId: 'a' };
    expect(normalizeEvidence({ record })).toBe(record);
  });
  it('converts evidence from before the runner', () => {
    const old = {
      script: 'damage-credit', order: 'hero-parka', sessionCustomerId: 'cus_marcus', captureBefore: {}, captureAfter: {},
      refunds: [{ call: { toolCallId: 't', args: { capture_id: 'C1' } }, readBack: paypal() }],
    };
    expect(normalizeEvidence(old)).toMatchObject({
      personaId: 'time-traveler', refunds: [{ refundId: 'R1', amountCents: 9600, succeeded: true }],
    });
  });
});
