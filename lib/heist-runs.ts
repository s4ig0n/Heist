import { createLiveDeps } from "@/packages/runner/src/live-deps";
import {
  createRunManager,
  type RunManager,
  type RunState,
} from "@/packages/runner/src/run-manager";

// Kept on globalThis because dev reloads re-evaluate this module, and a run in
// progress must stay findable. A run lives in this one server process.
const store = globalThis as typeof globalThis & { heistRuns?: RunManager };

export function getRunManager(): RunManager {
  store.heistRuns ??= createRunManager(createLiveDeps(process.cwd()));
  return store.heistRuns;
}

/** Null means allowed. Starting a run spends sandbox captures and model quota. */
export function refuseRunStart(request: Request): Response | null {
  const token = process.env.HEIST_RUN_TOKEN;

  if (!token) {
    return process.env.NODE_ENV === "production"
      ? Response.json({ error: "Runs are disabled: HEIST_RUN_TOKEN is not set" }, { status: 503 })
      : null;
  }

  return request.headers.get("authorization") === `Bearer ${token}`
    ? null
    : Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function runView(run: RunState) {
  return {
    runId: run.runId,
    status: run.status,
    personaIds: run.personaIds,
    scripted: run.scripted,
    guarded: run.guarded,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    score: run.score,
    verdicts: run.verdicts,
    attackIds: run.records.map((record) => record.attackId),
    streamUrl: `/api/runs/${run.runId}/stream`,
  };
}
