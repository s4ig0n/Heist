import { CheckoutPaymentIntent, type OrdersController } from '@paypal/paypal-server-sdk';
import { paypalLimiter, type TokenBucket } from './limiter';

export interface CaptureSpec { key: string; item: string; amount: string }

/** Creates a sandbox order paid by test card, which captures in one call with no buyer approval. */
export async function captureOrder(
  orders: Pick<OrdersController, 'createOrder'>,
  requestId: string,
  spec: CaptureSpec,
  limiter: TokenBucket = paypalLimiter,
): Promise<{ paypalOrderId: string; paypalCaptureId: string }> {
  const { result } = await limiter.run(() =>
    orders.createOrder({
      paypalRequestId: requestId,
      prefer: 'return=representation',
      body: {
        intent: CheckoutPaymentIntent.Capture,
        purchaseUnits: [{
          referenceId: spec.key,
          description: `Nimbus Outfitters: ${spec.item}`,
          amount: { currencyCode: 'USD', value: spec.amount },
        }],
        paymentSource: {
          card: { name: 'Test Buyer', number: '4111111111111111', expiry: '2030-12', securityCode: '123' },
        },
      },
    }),
  );
  const capture = result.purchaseUnits?.[0]?.payments?.captures?.[0];
  if (!result.id || !capture?.id || capture.status !== 'COMPLETED') {
    throw new Error(`Seed ${spec.key} did not capture: order=${result.id} capture=${capture?.id} status=${capture?.status}`);
  }
  return { paypalOrderId: result.id, paypalCaptureId: capture.id };
}
