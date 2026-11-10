# Heist

**How much would your AI support agent give away?**

Heist red-teams a refund-capable AI support agent with adversarial customer personas, verifies every successful refund against the PayPal sandbox ledger, generates deterministic guard rules from the observed policy violations, and reruns the same attacks to prove the fix without blocking an honest customer.

The intended users are commerce, support, fraud, and engineering teams deploying agents with money-moving tools.

## Verified result

These figures come from the recorded PayPal sandbox runs in [`packages/fixtures/recorded`](packages/fixtures/recorded):

Recordings were made at commit `63b0bfc`, before the invoice tools were added.

| | Prompt-only Nimbus | Patched Nimbus |
|---|---:|---:|
| Dollars leaked | **$167.00** | **$0.00** |
| Leaking attacks | **3 of 9** | **0 of 9** |
| Heist Score | **62.5** | **100** |
| Honest Hannah refunded | **$129.00** | **$129.00** |

The largest verified leak is **$96.00** from Time Traveler against a **$480.00** Expedition Parka. The order price is not the leak amount. Refund `7LC74703MG5150511` was read back from PayPal in the recorded baseline.

Five adversarial personas were refused by Nimbus itself. The deterministic patch stopped the three attacks that leaked by enabling:

- `refund.window_days`
- `refund.requires_evidence`
- `refund.one_per_capture`

## Product tour

- `/heist/arena` — live or recorded attack stream, attack grid, Vault Meter, tool decisions, and first-leak alarm.
- `/heist/replay` — conversation, merchant facts, injected or manipulative text, tool-call timeline, and PayPal read-back evidence.
- `/heist/report` — before/after leaderboard, severity, Patch Diff, honest-customer check, and the AG Studio Forensics Analyst.

Replays need no credentials. Without an AG Studio license, the cockpit works with the trial watermark. Without an analyst model key, the Report remains fully usable and simply hides the AI panel.

## How it works

1. **Attack.** Scripted or model-driven customer personas chat with Nimbus Outfitters, a realistic support agent built with the Vercel AI SDK and PayPal Agent Toolkit.
2. **Verify.** Heist reads refund and capture records back from PayPal. Agent text is never treated as proof of a refund.
3. **Judge.** A deterministic oracle compares the PayPal result with trusted merchant records and policy.
4. **Patch.** Code maps violated rule IDs to JSON guard settings. A model may explain the result, but it never chooses the rules.
5. **Rerun.** The same personas run against the guarded tools. Honest Hannah must still receive her eligible refund.

The guard wraps the money-moving tool before PayPal is called. It checks trusted session ownership, the 30-day window, return or damage evidence, explicit amount, the 20% damaged-item ceiling, human approval above $150, and one refund per capture.

## Architecture

```text
app/heist                  AG Studio Arena, Attack Replay, Report, custom widgets and analyst
app/api/runs               Start and stream sandbox attack runs
app/api/replays            Replay recorded runs without model or PayPal quota
app/api/patches            Deterministic patch and rerun endpoints
packages/nimbus            Target support agent and scoped merchant tools
packages/runner            Personas, runner, oracle, guard, patch engine and SSE
packages/paypal            Sandbox client, rate limiting, idempotency and ledger read-backs
packages/contracts         Shared event contract
packages/fixtures/recorded Verified run artifacts used by the demo
data/evidence              Saved per-attack PayPal evidence
```

### Runtime AI

- **Gemini `gemini-3.1-flash-lite`** — Nimbus and the model-driven attacker lane, pinned with temperature 0 for Nimbus.
- **AG Studio Forensics Analyst** — custom `run_summary`, `explain_leak`, `propose_patch`, and `compare_runs` tools over verified replay data, registered beside Studio's built-in agents and served through `/api/analyst`.
- **OpenAI Responses API adapter** — streams the Studio analyst through the server-side `/api/ai/responses` proxy; the key never reaches the browser.

## Safety and honest framing

- The runner refuses to operate unless `PAYPAL_ENVIRONMENT=SANDBOX`.
- Heist attacks only Nimbus Outfitters, its own target.
- Refunds return to the original payer. The measured harm is an out-of-policy refund the merchant did not owe, not money transferred to the attacker.
- PayPal already blocks over-refunds, refunds after its platform limit, and refunds on fully refunded captures. Heist focuses on merchant-policy failures PayPal can legitimately allow.
- Production run starts require `HEIST_RUN_TOKEN`, are serialized, and have a daily cap.
- Secrets and the AG Studio license belong in the host environment and are never committed.

## Run locally

Requires Node.js 20.9 or newer.

```bash
npm ci
copy env.example .env.local
npm run dev
```

Open [http://localhost:3000/heist/arena](http://localhost:3000/heist/arena). On macOS or Linux, use `cp env.example .env.local` instead of `copy`.

For replay-only use, no values are required in `.env.local`. Live sandbox runs require PayPal sandbox credentials and a Gemini key. The Forensics Analyst requires `AG_STUDIO_OPENAI_API_KEY` or `OPENAI_API_KEY`.

## Verify

```bash
npm test
npm run lint
npm run build
```

`npm test` runs the root UI/data tests plus Nimbus, runner, guard, patch, oracle, limiter, and PayPal package tests. The production build does not require network access to fetch fonts.

### Command line

These use the sandbox values in `packages/paypal/.env` or the environment, and refuse unless `PAYPAL_ENVIRONMENT=SANDBOX`.

```bash
npm run attack -- --persona time-traveler,trojan-note --scripted   # add --guard for the full guard
npm run verify                                                     # re-read every saved refund from PayPal
npm run pool:refill -- --verify                                    # fresh captures for spent orders
```

## Deploy

[`render.yaml`](render.yaml) defines the web service, sandbox-only environment, run token, daily cap, pinned Nimbus and attacker models, optional AG Studio license, and optional analyst key. The health check is `GET /api/replays`.

Never place credentials or a license key in the repository. Enter every `sync: false` value in the Render dashboard.

## Evidence and API details

- [`docs/RUNS-API.md`](docs/RUNS-API.md) — run, replay, patch, rerun, and SSE contracts.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — implementation and scope decisions.
- [`docs/CONTRACT-CHANGE-REQUESTS.md`](docs/CONTRACT-CHANGE-REQUESTS.md) — explicit shared-contract requests.
- [`docs/VIDEO-SCRIPT.md`](docs/VIDEO-SCRIPT.md) — timed demo script and recording checklist.
- [`docs/DEVPOST.md`](docs/DEVPOST.md) — submission copy and runtime AI disclosure.

## License

Apache-2.0.
