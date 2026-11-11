import { createPayPalClient } from "@/packages/paypal/src/client";
import { LedgerReader } from "@/packages/paypal/src/ledger";
import { REFUND_ID, cached, recordedRefundIds } from "@/lib/heist-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const error = (status: number, message: string) => Response.json({ error: message }, { status });

let ledger: LedgerReader | null = null;

// GET /api/ledger/refund/:id: reads one recorded refund back from the PayPal sandbox
// (GET /v2/payments/refunds/{id}), so "Verify on PayPal" shows PayPal's own current answer.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!REFUND_ID.test(id)) return error(400, "That is not a PayPal refund ID.");
  if (!(await recordedRefundIds()).has(id)) return error(404, "Only refunds from the recorded runs can be verified here.");

  try {
    ledger ??= new LedgerReader(createPayPalClient());
  } catch {
    return error(503, "PayPal sandbox credentials are not configured on this deployment.");
  }

  try {
    const refund = await cached(id, async () => {
      const found = await ledger!.refund(id);
      return found
        ? { id: found.id, status: found.status, amount: found.amount, captureId: found.captureId, checkedAt: new Date().toISOString() }
        : null;
    });
    if (!refund) return error(404, "PayPal has no refund with that ID.");
    return Response.json(refund, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return error(502, "PayPal did not answer. Try again in a moment.");
  }
}
