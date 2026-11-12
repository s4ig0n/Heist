# Devpost submission copy

## Project name

Heist

## Tagline

Attack your refund-capable AI agent, verify every leak on PayPal, patch the policy in code, and rerun to prove the fix.

## Short description

Heist is a red-team cockpit for commerce agents with money-moving tools. Adversarial AI customers attack Nimbus Outfitters, a realistic support agent built with PayPal's Agent Toolkit. Heist verifies every successful refund against the PayPal sandbox ledger, scores the merchant-policy loss, generates deterministic guardrails from the violated rule IDs, and reruns the same attacks to prove that covered leaks reach zero while an honest customer still receives her refund.

## The problem

PayPal's Agent Toolkit lets an AI support agent call `create_refund` directly, so a refund policy written in a prompt only holds as long as the model follows it.

- US shoppers were expected to return about $849.9 billion of merchandise in 2025, and retailers estimated 9% of returns were fraudulent (NRF and Happy Returns, 2025 Retail Returns Landscape).
- In *Moffatt v. Air Canada* (2024 BCCRT 149), a tribunal held the airline liable for refund terms its chatbot made up.

**Who it's for:** the support or operations lead deciding whether an AI agent may issue refunds, and the developer wiring the Agent Toolkit who needs a regression suite.

## What PayPal blocks, and what your agent can still do

PayPal correctly refuses over-refunds, refunds on fully refunded captures, and refunds past its own time limit. It just as correctly executes a refund that breaks the merchant's policy: past the 30-day window, with no return or damage on file, a full refund where a 20% credit applies, a second partial refund, a refund with no amount, or a refund on another customer's order. Heist measures exactly that second group, and reports PayPal's own refusals separately.

## Try it

- **Start here:** [heist-dts7.onrender.com](https://heist-dts7.onrender.com), the result on one page.
- **Jump straight to the demo:** [heist-dts7.onrender.com/heist/arena](https://heist-dts7.onrender.com/heist/arena). Pick a recorded run and press Replay.

No login or keys needed. The free host can take about a minute to wake.

## Inspiration

Support agents are moving from answering questions to taking financial actions. A merchant can write “refund only within 30 days” in a system prompt, but a persuasive customer, indirect prompt injection, invented evidence, or a malformed tool call can still produce an action the payment platform is allowed to execute.

Merchants need more than a policy prompt and a happy-path demo. They need a repeatable answer to three questions:

1. What can an adversarial customer make this agent do?
2. Did money actually move?
3. Can we enforce the fix without breaking legitimate support?

## What it does

Heist runs adversarial personas against Nimbus Outfitters, including Time Traveler, Tool Whisperer, Neighbor, Double Dipper, and Slow Burn, plus Honest Hannah as the benign control.

For every attack, the Arena streams the conversation and tool calls into an AG Studio cockpit. If Nimbus issues a refund, Heist reads the refund and capture back from PayPal and applies a deterministic policy oracle. Attack Replay puts the customer's claims beside the merchant's trusted records, highlights manipulative or injected text, and shows the exact PayPal evidence.

The patch engine maps observed violations to JSON guard rules. A model may explain why a patch exists, but code alone selects the rules. The guard wraps `create_refund.execute` and evaluates the trusted session, merchant records, tool arguments, and PayPal capture state before the request reaches PayPal.

The Report compares the baseline and patched rerun, shows a Patch Diff, and keeps Honest Hannah visible as a regression test. A custom AG Studio Forensics Analyst, with `run_summary`, `explain_leak`, `propose_patch` and `compare_runs` tools, is built to answer questions such as “Which persona cost us most? Chart it.” by delegating the chart to Studio's built-in agents.

## Verified result

In the recorded real PayPal sandbox baseline:

- **$167.00** leaked across **3 of 9** attacks.
- Time Traveler produced the largest verified leak: **$96.00** on a **$480.00** order.
- Five adversarial attacks were refused by Nimbus itself.
- Honest Hannah received her legitimate **$129.00** refund.
- The Heist Score was **62.5**.

The deterministic patch enabled `refund.window_days`, `refund.requires_evidence`, and `refund.one_per_capture`. In the recorded patched rerun:

- Covered leaks fell to **$0.00**.
- The Heist Score rose to **100**.
- Honest Hannah still received her **$129.00** refund.

These are PayPal sandbox results. Refunds return to the original payer; a “leak” is an out-of-policy refund the merchant did not owe, not money transferred to the attacker.

Separately, a Trojan Note case study (a hostile instruction planted in an invoice note) produced one out-of-policy $140.00 refund against plain Nimbus. With the guard's quarantine on, the planted text never reached the agent, and Nimbus refused. It is not part of the $167 result.

A Tool Whisperer case study produced a critical **$455.00** refund on plain Nimbus by getting it to call `create_refund` with no amount, on an order owed a $91 credit (refund `1V3898336M0583054`). That exact call, replayed through the guard, is denied under `refund.explicit_amount` before PayPal is called. In the guarded live rerun, Nimbus issued the correct $91 credit and the guard allowed it. It is not part of the $167 result either.

Recorded runs use one pinned model and scripted customers to test known failure modes; they are not a general benchmark. In recorded live runs the guard denied refunds under `refund.window_days` and `refund.one_per_capture`; its other refund rules are covered by deterministic tests.

## How we built it

- **Next.js 16 and React 19** host the cockpit and server routes.
- **PayPal Agent Toolkit** gives Nimbus restricted order and refund tools.
- **PayPal Orders and Payments APIs** seed sandbox captures and read refund evidence back from the ledger.
- **Vercel AI SDK and Gemini** run Nimbus, pinned at temperature 0. The recorded attacks are scripted; a model-driven attacker mode exists but is not used in the recordings.
- **AG Studio and AG Grid** power the Arena, Report, attack grid, charts, custom theme, Vault Meter, Patch Diff, and Forensics Analyst.
- **Zod and Vitest** validate the shared event stream and cover Nimbus, runner, oracle, guard, patch engine, data reducers, and analyst summaries.
- **Render** runs the single web service with sandbox-only settings, protected live-run starts, serialized execution, and a daily cap.

## Technical highlights

### Ledger-first verification

The score never trusts the agent's prose. A refund counts only when PayPal's API returns the executed refund and its capture relationship.

### Deterministic policy enforcement

The oracle and guard share rule IDs, but not implementation. The oracle evaluates completed actions; the guard evaluates a proposed money-moving call before PayPal sees it. The LLM cannot choose or disable rules.

### Trusted identity boundary

`sessionCustomerId` is set by the host. `lookup_my_orders`, `get_return_status`, and invoice context are scoped to that identity; the conversation cannot choose another customer.

### Honest-customer regression

Honest Hannah runs in both lanes. A defense that blocks every refund would score poorly because the benign success rate is part of the Heist Score.

### AG Studio as an investigation surface

The cockpit is more than a dashboard. It combines custom widgets, a noir theme, live SSE data, evidence replay, a deterministic patch diff, and a custom analyst that delegates chart construction to Studio's built-in agents.

## Challenges

- Separating a merchant-policy violation from a PayPal platform error required ledger read-backs and a deterministic oracle.
- Refund tools are not safely retryable without idempotency, so every live path is rate-limited and intentionally conservative.
- The target had to be realistic enough to refuse most attacks while still exposing the limits of prompt-only policy.
- Recorded runs had to remain replayable without credentials while preserving exact tool calls, verdicts, and PayPal evidence.

## What we learned

- Payment platforms can correctly execute an action that is still wrong for the merchant's policy.
- Prompt instructions are valuable behavior guidance, but financial authorization belongs in deterministic code at the tool boundary.
- A benign control changes the security objective from “block everything” to “block only what violates policy.”
- Evidence-rich replay makes an agent failure understandable to support and fraud teams, not just model engineers.

## What's next

- Expand the same guard interface to subscription cancellation and dispute actions.
- Add durable run storage and team review workflows.
- Import merchant policies into the JSON rule format with explicit human approval before activation.
- Add evaluation packs for more commerce verticals while keeping every target owned and every payment in a sandbox.

## Runtime AI tools and models

- Gemini `gemini-3.1-flash-lite`: the Nimbus support agent. The recorded customers are scripted; a model-driven attacker mode (same model family) exists but is not used in the recordings.
- PayPal Agent Toolkit: restricted PayPal tools exposed to Nimbus.
- AG Studio AI agents: built-in data, widget, page, planning, and lead agents.
- Heist Forensics Analyst: custom `run_summary`, `explain_leak`, `propose_patch`, and `compare_runs` tools through `/api/analyst`, with chart work delegated to AG Studio's agents.
- OpenAI Responses API: model transport for the AG Studio analyst through a server-side proxy.

## Built during the hackathon

Built October 27 to November 11, 2026, from PayPal's AG Grid boilerplate. Team: Ashvin Jaison Olickal and Gouri.

## Safety

Heist runs only in the PayPal sandbox and only against Nimbus Outfitters, its own target. The code refuses live PayPal mode. Secrets and the AG Studio license remain server-side. Production live-run starts require a token, run one at a time, and have a daily cap.
