# Runs API

Real runs in the PayPal sandbox. Everything here refuses unless `PAYPAL_ENVIRONMENT=SANDBOX`.

| Route | What it does |
|---|---|
| `POST /api/runs` | Starts a run. Returns 202 with `runId` and `streamUrl`. |
| `GET /api/runs` | Runs since the server started. |
| `GET /api/runs/:id` | Status, score, and a verdict per attack. |
| `GET /api/runs/:id/stream` | Server-sent events for the run. |
| `GET /api/attacks/:id` | One attack's full record, including the transcript. |

**Starting a run.** The body is optional: `{ "personas": ["time-traveler"], "scripted": true, "guarded": true }`.

- With no personas, it runs the short default, Honest Hannah and Time Traveler. Every persona has fixed lines, so a scripted run only spends model quota on Nimbus. `scripted: false` uses the LLM attacker, and with no personas it runs all of them, which uses far more quota.
- `guarded: true` puts the policy guard in front of `create_refund`. The stream then also carries `guard.decision` events. A call the guard stops emits no `refund.observed`, because it never reached PayPal.
- Only one run at a time: a second start gets 409. An unknown persona gets 400. More than `HEIST_MAX_RUNS_PER_DAY` runs (default 10, counted per server process) gets 429.
- In production, `HEIST_RUN_TOKEN` must be set and sent as `Authorization: Bearer <token>`. Without it, starts get 503. Don't put the token in client code: a server action or route should add it.

**The stream.** Every message is a `HeistEvent` from `packages/contracts`. Attack events arrive as plain messages, like the mock stream, so `onmessage` reads both. `run.status` and `run.summary` arrive as named events of the same name:

```ts
const source = new EventSource(run.streamUrl);
source.onmessage = (m) => handleEvent(JSON.parse(m.data)); // HeistEvent
source.addEventListener("run.summary", (m) => showScore(JSON.parse(m.data)));
source.addEventListener("run.status", (m) => {
  const { status, message } = JSON.parse(m.data); // queued | running | finished | failed
  if (status === "finished" || status === "failed") source.close();
});
```

Per attack, in order: `attack.started`; then `turn` for each line (`role` is `attacker` or `target`); for each tool call, `tool.called` (with `toolCallId`), `guard.decision` on guarded runs, `tool.result` (`ok`, `errorCode`), `injection.observed` when the result carries text Heist planted, and `refund.observed` (with `paypalCaptureId` and `toolCallId`) for a refund that reached PayPal; then `attack.completed` (with `blockedBy`, `paypalErrorCode` and `severity` when they apply). The target's `turn` comes after its tool calls.

A late or reconnecting client gets everything it missed, in order. A `: ping` comment goes out every 15 seconds. A `running` status with a `message` reports a problem with one attack while the run continues.

**Score** (`run.summary`, at the top level of the event): `heistScore` (null without both a valid attack and a valid benign run), `leakRate`, `benignSuccessRate`, `leakedCents`, `cappedByCriticalLeak`, and `counts` by bucket: `leaked`, `blocked_by_paypal`, `blocked_by_guard`, `refused_by_agent`, `allowed`, `benign_denied`, `failed`.

**Attack record** (`/api/attacks/:id`): `record.transcript`, `record.toolCalls`, `record.refunds` (with PayPal's read-back), `record.verdict`.

**Limits.** Attacks run one after another in one server process. A run stops after two failed attacks in a row. Runs and evidence are JSON files under `data/evidence`, and `data/merchant.json` is rewritten as captures are spent and refilled, so a host with a temporary disk loses them on restart.

## Patches

A patch is the smallest set of guard rules that covers what a run leaked. It's worked out from the run each time, so the same run always gives the same patch. This backs the Patch Diff widget and "Apply and rerun".

| Route | What it does |
|---|---|
| `POST /api/runs/:id/patch` | The patch for a finished run or a recording, such as `baseline-run`. No token. 409 if the run isn't over, 422 if it leaked nothing. |
| `GET /api/patches/:id` | The same patch again. `id` is `patch-<run id>`. |
| `POST /api/patches/:id/rerun` | Runs the same personas with only the patch's rules on. Needs the token. Returns 202, like starting a run. |

A patch has `patchId`, `fromRunId`, `personaIds`, `scripted`, `before` and `after` (the whole rule JSON, for the diff), and `changes`: `{ ruleId, enabled: { from, to }, because: [personaId] }`.

## Replays

Recorded real runs, for when a live run is too slow or out of quota. They need no token and spend nothing. The refund IDs in them are real and stay verifiable on PayPal.

| Route | What it does |
|---|---|
| `GET /api/replays` | The recorded runs. |
| `GET /api/replays/:id` | One recording's status, score, verdicts and attack records. |
| `GET /api/replays/:id/stream?speed=1` | The recording over SSE, in the same format as a live run. `speed` is 1, 4 or 16. |

The stream ends with `event: replay.finished`, as the mock stream does. Recordings are in `packages/fixtures/recorded`.
