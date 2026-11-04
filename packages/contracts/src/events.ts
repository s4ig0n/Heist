
import { z } from "zod";

// Shared identifiers
export const RuleIdSchema = z.enum([
  "refund.ownership",
  "refund.window_days",
  "refund.one_per_capture",
  "refund.max_ratio",
  "refund.explicit_amount",
  "refund.human_approval_above",
  "subscription.ownership",
  "dispute.accept_disabled",
  "untrusted_fields.quarantine",
]);

export const OutcomeSchema = z.enum([
  "leak",
  "blocked",
  "allowed",
  "failed",
]);

export const VerificationSchema = z.enum([
  "mock",
  "sandbox",
]);

// Fields shared by all events
const BaseEvent = z.object({
  eventId: z.string().min(1),
  runId: z.string().min(1),
  attackId: z.string().min(1),
  timestamp: z.string().datetime(),
  verification: VerificationSchema,
});

// An attack starts
const AttackStarted = BaseEvent.extend({
  type: z.literal("attack.started"),
  persona: z.string(),
  technique: z.string().optional(),
});

// Nimbus requests a tool
const ToolCalled = BaseEvent.extend({
  type: z.literal("tool.called"),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()).optional(),
});

// Injection detected in untrusted content
const InjectionObserved = BaseEvent.extend({
  type: z.literal("injection.observed"),
  source: z.string(),
  text: z.string(),
});

// Refund result (mock or verified)
const RefundObserved = BaseEvent.extend({
  type: z.literal("refund.observed"),
  amountCents: z.number().int().nonnegative(),
  currency: z.literal("USD"),
  status: z.enum(["succeeded", "failed"]),
  paypalRefundId: z.string().optional(),
});

// An attack finishes
const AttackCompleted = BaseEvent.extend({
  type: z.literal("attack.completed"),
  persona: z.string(),
  status: OutcomeSchema,
  amountCents: z.number().int().nonnegative(),
  currency: z.literal("USD"),
  ruleIds: z.array(RuleIdSchema),
});

// Guard intervention
const GuardDecision = BaseEvent.extend({
  type: z.literal("guard.decision"),
  tool: z.string(),
  decision: z.enum([
    "allow",
    "deny",
    "pending_approval",
  ]),
  ruleIds: z.array(RuleIdSchema),
});

// Complete event contract
export const HeistEventSchema = z.discriminatedUnion(
  "type",
  [
    AttackStarted,
    ToolCalled,
    InjectionObserved,
    RefundObserved,
    AttackCompleted,
    GuardDecision,
  ]
);

export type HeistEvent = z.infer<
  typeof HeistEventSchema
>;

export type RuleId = z.infer<
  typeof RuleIdSchema
>;

export type AttackOutcome = z.infer<
  typeof OutcomeSchema
>;
