import { createHash } from 'node:crypto';

/**
 * PayPal-Request-Id for a POST. The same (run, attack, tool call) always gives the same key,
 * so a retried request returns PayPal's original result instead of refunding twice.
 */
export function paypalRequestId(runId: string, attackId: string, toolCallId: string): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([runId, attackId, toolCallId])) // JSON keeps ("a","bc") ≠ ("ab","c")
    .digest('hex');
  return `heist-${digest.slice(0, 40)}`;
}