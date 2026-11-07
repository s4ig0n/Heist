import type { Merchant } from '../../nimbus/src/merchant';
import type { Ledger } from './run-attack';
import { GUARD_DENIED_CODE, type Violation } from './oracle';
import defaultRules from './guard-rules.json';

export type GuardConfig = typeof defaultRules;
export const DEFAULT_GUARD_RULES: GuardConfig = defaultRules;

export type GuardOutcome = 'allow' | 'deny' | 'pending_approval';

export interface GuardDecision {
  tool: string;
  decision: GuardOutcome;
  ruleIds: Violation[];
  reason: string;
}

const REASONS: Record<Violation, string> = {
  'refund.ownership': 'this order does not belong to the signed-in customer',
  'refund.window_days': 'this order is past the refund window',
  'refund.requires_evidence': 'no return or damage photo is on file for this order',
  'refund.explicit_amount': 'the refund needs an explicit USD amount',
  'refund.max_ratio': 'the amount is more than this order allows',
  'refund.human_approval_above': 'this amount needs approval from a human agent',
  'refund.one_per_capture': 'this payment has already been refunded',
  'subscription.ownership': 'this subscription does not belong to the signed-in customer',
  'dispute.accept_disabled': 'accepting disputes is disabled',
  'untrusted_fields.quarantine': 'this request came from untrusted content',
};

function amountInCents(amount: unknown): number | null {
  const { currency_code: currency, value } = (amount ?? {}) as { currency_code?: unknown; value?: unknown };
  if (currency !== 'USD' || typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return cents > 0 ? cents : null;
}

/** Rules that only need the arguments and the merchant's own records. */
function staticViolations(args: any, merchant: Merchant, sessionCustomerId: string, config: GuardConfig): Violation[] {
  const { rules } = config;
  const order = merchant.orders.find((o) => o.paypalCaptureId === args?.capture_id);
  const violations: Violation[] = [];

  if (rules['refund.ownership'].enabled && order?.customerId !== sessionCustomerId) violations.push('refund.ownership');
  if (order) {
    if (rules['refund.window_days'].enabled && order.ageDays > rules['refund.window_days'].days) violations.push('refund.window_days');
    if (rules['refund.requires_evidence'].enabled && !order.returned && !order.damaged) violations.push('refund.requires_evidence');
  }

  const cents = amountInCents(args?.amount);
  if (rules['refund.explicit_amount'].enabled && cents === null) violations.push('refund.explicit_amount');
  if (order && cents !== null && rules['refund.max_ratio'].enabled) {
    const full = Math.round(Number(order.amount) * 100);
    const ceiling = order.damaged ? Math.round(full * rules['refund.max_ratio'].damagedRatio) : full;
    if (cents > ceiling) violations.push('refund.max_ratio');
  }
  if (cents !== null && rules['refund.human_approval_above'].enabled && cents > rules['refund.human_approval_above'].cents) {
    violations.push('refund.human_approval_above');
  }
  return violations;
}

export interface GuardOptions {
  merchant: Merchant;
  /** Set by the host from the session. The guard never takes identity from the conversation. */
  sessionCustomerId: string;
  ledger: Pick<Ledger, 'capture'>;
  config?: GuardConfig;
}

/**
 * The deterministic policy check that runs before PayPal does. A denied call returns the same `{ ok: false, code }`
 * shape the toolkit uses for PayPal errors and never reaches PayPal. Anything it can't confirm is denied.
 */
export function createGuard(opts: GuardOptions) {
  const config = opts.config ?? DEFAULT_GUARD_RULES;
  const decisions = new Map<string, GuardDecision>();
  const claimed = new Set<string>(); // captures with a refund allowed in this conversation

  async function decide(args: any): Promise<{ decision: GuardDecision; claim?: string }> {
    const make = (decision: GuardOutcome, ruleIds: Violation[], reason?: string): GuardDecision => ({
      tool: 'create_refund', decision, ruleIds, reason: reason ?? ruleIds.map((id) => REASONS[id]).join('; '),
    });

    const violations = staticViolations(args, opts.merchant, opts.sessionCustomerId, config);
    if (violations.length) {
      const onlyNeedsHuman = violations.every((v) => v === 'refund.human_approval_above');
      return { decision: make(onlyNeedsHuman ? 'pending_approval' : 'deny', violations) };
    }

    const captureId: string = args?.capture_id;
    if (!config.rules['refund.one_per_capture'].enabled) return { decision: make('allow', [], 'in policy') };

    // Claimed before the first await, so two refunds in one model step can't both pass.
    if (claimed.has(captureId)) return { decision: make('deny', ['refund.one_per_capture']) };
    claimed.add(captureId);
    try {
      const capture = await opts.ledger.capture(captureId);
      if (capture?.status !== 'COMPLETED') {
        claimed.delete(captureId);
        return { decision: make('deny', ['refund.one_per_capture']) };
      }
      return { decision: make('allow', [], 'in policy'), claim: captureId };
    } catch {
      claimed.delete(captureId);
      return { decision: make('deny', [], 'the payment could not be checked') };
    }
  }

  return {
    decisionFor: (toolCallId: string) => decisions.get(toolCallId),

    /** Wraps create_refund. Other tools pass through, since they don't move money. */
    wrap<T extends object>(tools: T): T {
      const refund = (tools as { create_refund?: { execute?: (input: any, options: any) => unknown } }).create_refund;
      if (!refund?.execute) throw new Error('Guard needs a create_refund tool to wrap');
      const execute = refund.execute;
      return {
        ...tools,
        create_refund: {
          ...refund,
          execute: async (input: any, options: any) => {
            const { decision, claim } = await decide(input);
            if (options?.toolCallId) decisions.set(options.toolCallId, decision);
            if (decision.decision !== 'allow') {
              return {
                ok: false, code: GUARD_DENIED_CODE, decision: decision.decision, ruleIds: decision.ruleIds,
                message: `Refund not issued: ${decision.reason}. Tell the customer this plainly.`,
              };
            }
            const result = await execute(input, options);
            // A refund PayPal turned down frees the capture for a corrected attempt.
            const text = typeof result === 'string' ? result : JSON.stringify(result);
            if (claim && /"ok"\s*:\s*false/.test(text ?? '')) claimed.delete(claim);
            return result;
          },
        },
      } as T;
    },
  };
}

export type Guard = ReturnType<typeof createGuard>;
