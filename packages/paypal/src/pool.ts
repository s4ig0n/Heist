import type { OrdersController } from '@paypal/paypal-server-sdk';
import { captureOrder } from './capture-order';
import { paypalRequestId } from './idempotency';
import type { LedgerReader } from './ledger';
import type { TokenBucket } from './limiter';
import type { MerchantData, PooledOrder } from './seed';

const REFILL_RUN = 'refill-v1';

/** A consumed capture stays listed, so old evidence files can still be traced back to their order. */
export interface RetiredCapture { paypalOrderId: string; paypalCaptureId: string; retiredAt: string }
export type RefillableOrder = PooledOrder & { previousCaptures?: RetiredCapture[] };

/**
 * Which orders need a fresh capture: named keys if given, otherwise anything marked used.
 * `statuses` (capture status read back from PayPal, null = not found) also catches captures that were
 * spent without the pool knowing. Only COMPLETED has its full amount left to refund.
 */
export function selectForRefill(
  orders: RefillableOrder[],
  opts: { keys?: string[]; statuses?: Record<string, string | null> } = {},
): RefillableOrder[] {
  if (opts.keys?.length) {
    return opts.keys.map((key) => {
      const order = orders.find((o) => o.key === key);
      if (!order) throw new Error(`Unknown order key "${key}"`);
      return order;
    });
  }
  const { statuses } = opts;
  return orders.filter(
    (o) => o.poolStatus === 'used' || (statuses && o.key in statuses && statuses[o.key] !== 'COMPLETED'),
  );
}

/**
 * Gives one order a fresh capture in place. The key, customer and policy facts stay the same, so attacks
 * keep targeting the same order. The request id is tied to the generation: a crash before saving retries
 * into PayPal's original result, and the next refill of this order gets a new capture.
 */
export async function refillOrder(
  orders: Pick<OrdersController, 'createOrder'>,
  order: RefillableOrder,
  now: Date,
  limiter?: TokenBucket,
): Promise<RefillableOrder> {
  const previous = order.previousCaptures ?? [];
  const generation = previous.length + 1;
  const fresh = await captureOrder(orders, paypalRequestId(REFILL_RUN, order.key, String(generation)), order, limiter);
  return {
    ...order,
    ...fresh,
    createdAtSimulated: new Date(now.getTime() - order.ageDays * 86_400_000).toISOString(),
    poolStatus: 'available',
    previousCaptures: [
      ...previous,
      { paypalOrderId: order.paypalOrderId, paypalCaptureId: order.paypalCaptureId, retiredAt: now.toISOString() },
    ],
  };
}

/** Refills an order, and only hands it back once PayPal reads the new capture back as COMPLETED for the full amount. */
export async function refillVerified(
  orders: Pick<OrdersController, 'createOrder'>,
  ledger: Pick<LedgerReader, 'capture'>,
  order: RefillableOrder,
  now: Date,
  limiter?: TokenBucket,
): Promise<RefillableOrder> {
  const fresh = await refillOrder(orders, order, now, limiter);
  const readBack = await ledger.capture(fresh.paypalCaptureId);
  if (readBack?.status !== 'COMPLETED' || Number(readBack.amount.value) !== Number(order.amount)) {
    throw new Error(`Refill of ${order.key} read back as ${JSON.stringify(readBack)}`);
  }
  return fresh;
}

export function replaceOrder(data: MerchantData, order: RefillableOrder): void {
  data.orders[data.orders.findIndex((o) => o.key === order.key)] = order;
}
