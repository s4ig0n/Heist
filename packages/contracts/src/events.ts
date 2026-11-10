
import { z } from "zod";

// Shared identifiers
export const RuleIdSchema = z.enum([
  "refund.ownership",
  "refund.window_days",
  "refund.one_per_capture",
  "refund.max_ratio",
  "refund.explicit_amount",
  "refund.human_approval_above",
  "refund.requires_evidence",
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

export const BlockedBySchema = z.enum([
  "agent",
  "paypal",
  "guard",
]);

export const SeveritySchema = z.enum([
  "critical",
  "high",
  "medium",
]);

export const RunStatusSchema = z.enum([
  "queued",
  "running",
  "finished",
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

// Run-level events belong to no single attack
const RunEvent = BaseEvent.extend({
  attackId: z.string().min(1).optional(),
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
  toolCallId: z.string().optional(),
  args: z.record(z.string(), z.unknown()).optional(),
});

// What a tool call returned. PayPal and guard errors arrive as ok: false
const ToolResult = BaseEvent.extend({
  type: z.literal("tool.result"),
  toolCallId: z.string(),
  tool: z.string(),
  ok: z.boolean(),
  errorCode: z.string().optional(),
});

// One line of the conversation
const Turn = BaseEvent.extend({
  type: z.literal("turn"),
  turnIndex: z.number().int().nonnegative(),
  role: z.enum(["attacker", "target"]),
  text: z.string(),
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
  paypalCaptureId: z.string().optional(),
  toolCallId: z.string().optional(),
});

// An attack finishes
const AttackCompleted = BaseEvent.extend({
  type: z.literal("attack.completed"),
  persona: z.string(),
  status: OutcomeSchema,
  amountCents: z.number().int().nonnegative(),
  currency: z.literal("USD"),
  ruleIds: z.array(RuleIdSchema),
  blockedBy: BlockedBySchema.optional(),
  paypalErrorCode: z.string().optional(),
  severity: SeveritySchema.optional(),
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

// A run changes state
const RunStatusEvent = RunEvent.extend({
  type: z.literal("run.status"),
  status: RunStatusSchema,
  message: z.string().optional(),
});

// The oracle's totals for a finished run. Counts use the oracle's bucket names
const RunSummary = RunEvent.extend({
  type: z.literal("run.summary"),
  heistScore: z.number().nullable(),
  leakRate: z.number().nullable(),
  benignSuccessRate: z.number().nullable(),
  leakedCents: z.number().int().nonnegative(),
  cappedByCriticalLeak: z.boolean(),
  counts: z.object({
    leaked: z.number().int().nonnegative(),
    blocked_by_paypal: z.number().int().nonnegative(),
    blocked_by_guard: z.number().int().nonnegative(),
    refused_by_agent: z.number().int().nonnegative(),
    allowed: z.number().int().nonnegative(),
    benign_denied: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
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
    ToolResult,
    Turn,
    RunStatusEvent,
    RunSummary,
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
