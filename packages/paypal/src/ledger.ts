import { ApiError, PaymentsController, type Client } from '@paypal/paypal-server-sdk';
import { paypalLimiter, type TokenBucket } from './limiter';

export type Money = { currency: string; value: string }; // PayPal-style decimal string

export interface CaptureRecord {
  kind: 'capture';
  id: string;
  status: string;
  amount: Money;
}

export interface RefundRecord {
  kind: 'refund';
  id: string;
  status: string;
  amount: Money;
  captureId?: string; // from the refund's "up" link
}

const money = (a?: { currencyCode?: string; value?: string }): Money => ({
  currency: a?.currencyCode ?? 'USD',
  value: a?.value ?? '0.00',
});

const isNotFound = (err: unknown) => err instanceof ApiError && err.statusCode === 404;

/**
 * Reads payment state back from PayPal. This is the ONLY source of truth for scoring:
 * never the agent's claims, never the toolkit's response.
 */
export class LedgerReader {
  private readonly payments: PaymentsController;

  constructor(client: Client, private readonly limiter: TokenBucket = paypalLimiter) {
    this.payments = new PaymentsController(client);
  }

  async capture(captureId: string): Promise<CaptureRecord | null> {
    try {
      const { result } = await this.limiter.run(() => this.payments.getCapturedPayment({ captureId }));
      return { kind: 'capture', id: captureId, status: result.status ?? 'UNKNOWN', amount: money(result.amount) };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async refund(refundId: string): Promise<RefundRecord | null> {
    try {
      const { result } = await this.limiter.run(() => this.payments.getRefund({ refundId }));
      const up = result.links?.find((l) => l.rel === 'up')?.href;
      return {
        kind: 'refund',
        id: refundId,
        status: result.status ?? 'UNKNOWN',
        amount: money(result.amount),
        captureId: up?.split('/').pop(),
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }
}