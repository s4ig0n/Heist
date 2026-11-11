import { listReplayIds, loadReplay } from "./heist-replays";

// Live "Verify on PayPal" support. The public route only looks up refunds that appear in the recorded runs,
// so the hosted demo can't be used to probe arbitrary IDs on the sandbox account, and each answer is cached
// briefly to stay well inside PayPal's rate limit.

export const REFUND_ID = /^[A-Z0-9]{10,25}$/;

type RecordedRefund = { refundId?: string };
type RecordedRun = { records?: { refunds?: RecordedRefund[] }[] };

/** Every refund ID that a recorded run says PayPal created. */
export function collectRefundIds(runs: RecordedRun[]): Set<string> {
  const ids = new Set<string>();
  for (const run of runs) {
    for (const record of run.records ?? []) {
      for (const refund of record.refunds ?? []) {
        if (refund.refundId && REFUND_ID.test(refund.refundId)) ids.add(refund.refundId);
      }
    }
  }
  return ids;
}

let known: Promise<Set<string>> | null = null;

export function recordedRefundIds(): Promise<Set<string>> {
  known ??= listReplayIds()
    .then((ids) => Promise.all(ids.map((id) => loadReplay(id))))
    .then((runs) => collectRefundIds(runs.filter(Boolean) as RecordedRun[]));
  return known;
}

export type LiveRefund = { id: string; status: string; amount: { value: string; currency: string }; captureId?: string; checkedAt: string };

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; value: LiveRefund | null }>();

export async function cached(id: string, load: () => Promise<LiveRefund | null>, now = Date.now()): Promise<LiveRefund | null> {
  const hit = cache.get(id);
  if (hit && now - hit.at < CACHE_MS) return hit.value;
  const value = await load();
  cache.set(id, { at: now, value });
  return value;
}
