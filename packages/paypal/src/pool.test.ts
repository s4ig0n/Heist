import { describe, expect, it } from 'vitest';
import { refillOrder, selectForRefill, type RefillableOrder } from './pool';

const order = (over: Partial<RefillableOrder> = {}): RefillableOrder => ({
  key: 'hero-parka', customerId: 'cus_marcus', item: 'Expedition Parka', amount: '480.00', ageDays: 45,
  returned: false, damaged: false, paypalOrderId: 'O1', paypalCaptureId: 'C1',
  createdAtSimulated: '2026-09-20T00:00:00.000Z', poolStatus: 'used', ...over,
});

function fakeOrders(status = 'COMPLETED') {
  const calls: any[] = [];
  return {
    calls,
    createOrder: async (req: any) => {
      calls.push(req);
      const n = calls.length + 1;
      return { result: { id: `O${n}`, purchaseUnits: [{ payments: { captures: [{ id: `C${n}`, status }] } }] } };
    },
  } as any;
}
const limiter = { run: <T>(fn: () => Promise<T>) => fn() } as any;
const NOW = new Date('2026-11-07T00:00:00.000Z');

describe('selectForRefill', () => {
  const available = order({ key: 'a', poolStatus: 'available' });
  const used = order({ key: 'u', poolStatus: 'used' });

  it('picks only orders marked used by default', () => {
    expect(selectForRefill([available, used]).map((o) => o.key)).toEqual(['u']);
  });
  it('catches captures PayPal says are spent or missing, even if the pool says available', () => {
    const missing = order({ key: 'm', poolStatus: 'available' });
    const statuses = { a: 'PARTIALLY_REFUNDED', m: null };
    expect(selectForRefill([available, missing], { statuses }).map((o) => o.key)).toEqual(['a', 'm']);
  });
  it('leaves COMPLETED captures alone', () => {
    expect(selectForRefill([available], { statuses: { a: 'COMPLETED' } })).toEqual([]);
  });
  it('named keys win, and an unknown key throws', () => {
    expect(selectForRefill([available, used], { keys: ['a'] }).map((o) => o.key)).toEqual(['a']);
    expect(() => selectForRefill([available], { keys: ['nope'] })).toThrow(/Unknown order key/);
  });
});

describe('refillOrder', () => {
  it('swaps in the new capture and keeps every policy fact', async () => {
    const fresh = await refillOrder(fakeOrders(), order(), NOW, limiter);
    expect(fresh).toMatchObject({
      key: 'hero-parka', customerId: 'cus_marcus', amount: '480.00', ageDays: 45, returned: false,
      paypalOrderId: 'O2', paypalCaptureId: 'C2', poolStatus: 'available',
      createdAtSimulated: '2026-09-23T00:00:00.000Z',
      previousCaptures: [{ paypalOrderId: 'O1', paypalCaptureId: 'C1', retiredAt: NOW.toISOString() }],
    });
  });
  it('reuses the request id until the refill is saved, then moves on', async () => {
    const orders = fakeOrders();
    const first = await refillOrder(orders, order(), NOW, limiter);
    await refillOrder(orders, order(), NOW, limiter); // crashed before saving: same generation
    await refillOrder(orders, first, NOW, limiter);   // saved: next generation
    const ids = orders.calls.map((c: any) => c.paypalRequestId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
  });
  it('charges the order amount', async () => {
    const orders = fakeOrders();
    await refillOrder(orders, order(), NOW, limiter);
    expect(orders.calls[0].body.purchaseUnits[0].amount).toEqual({ currencyCode: 'USD', value: '480.00' });
  });
  it('throws rather than handing back a capture that did not complete', async () => {
    await expect(refillOrder(fakeOrders('PENDING'), order(), NOW, limiter)).rejects.toThrow(/did not capture/);
  });
});
