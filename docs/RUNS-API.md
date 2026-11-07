# Runs API

Real runs in the PayPal sandbox. Everything here refuses unless `PAYPAL_ENVIRONMENT=SANDBOX`.

| Route | What it does |
|---|---|
| `POST /api/runs` | Starts a run. Returns 202 with `runId` and `streamUrl`. |
| `GET /api/runs` | Runs since the server started. |
| `GET /api/runs/:id` | Status, score, and a verdict per attack. |
| `GET /api/runs/:id/stream` | Server-sent events for the run. |
| `GET /api/attacks/:id` | One attack's full record, including the transcript. |

**Starting a run.** The body is optional: `{ "personas": ["time-traveler"], "scripted": true }`.

- With no personas, it runs every persona that has a script. `scripted: false` uses the LLM attacker, and with no personas it runs all of them. That uses far more model quota.
- Only one run at a time: a second start gets 409. An unknown persona, or an unscripted one in scripted mode, gets 400.
- In production, `HEIST_RUN_TOKEN` must be set and sent as `Authorization: Bearer <token>`. Without it, starts get 503. Don't put the token in client code: a server action or route should add it.

**The stream.** Contract events arrive as plain messages, like the mock stream, so `onmessage` reads both. Run-level items are named events until change request #5 is settled:

```ts
const source = new EventSource(run.streamUrl);
source.onmessage = (m) => handleEvent(JSON.parse(m.data)); // HeistEvent
source.addEventListener("run.summary", (m) => showScore(JSON.parse(m.data)));
source.addEventListener("run.status", (m) => {
  const { status, message } = JSON.parse(m.data); // queued | running | finished | failed
  if (status === "finished" || status === "failed") source.close();
});
```

A late or reconnecting client gets everything it missed, in order. A `: ping` comment goes out every 15 seconds. A `running` status with a `message` reports a problem with one attack while the run continues.

**Score** (`run.summary`): `heistScore` (null without both a valid attack and a valid benign run), `leakRate`, `benignSuccessRate`, `leakedCents`, `cappedByCriticalLeak`, and `counts` by bucket: `leaked`, `blocked_by_paypal`, `blocked_by_guard`, `refused_by_agent`, `allowed`, `benign_denied`, `failed`.

**Attack record** (`/api/attacks/:id`): `record.transcript`, `record.toolCalls`, `record.refunds` (with PayPal's read-back), `record.verdict`.

**Limits.** Attacks run one after another in one server process. A run stops after two failed attacks in a row. Runs and evidence are JSON files under `data/evidence`, and `data/merchant.json` is rewritten as captures are spent and refilled, so a host with a temporary disk loses them on restart.
