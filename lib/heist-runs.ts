import { loadReplay } from "@/lib/heist-replays";
import { createLiveDeps } from "@/packages/runner/src/live-deps";
import { generatePatch } from "@/packages/runner/src/patch";
import {
  createRunManager,
  isOver,
  RunConflictError,
  RunLimitError,
  RunRequestError,
  type RunManager,
  type RunState,
} from "@/packages/runner/src/run-manager";

// Kept on globalThis because dev reloads re-evaluate this module, and a run in
// progress must stay findable. A run lives in this one server process.
const store = globalThis as typeof globalThis & { heistRuns?: RunManager };

export function getRunManager(): RunManager {
  store.heistRuns ??= createRunManager(createLiveDeps(process.cwd()), undefined, {
    maxRunsPerDay: Number(process.env.HEIST_MAX_RUNS_PER_DAY) || 10,
  });
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
    patchId: run.patchId,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    score: run.score,
    verdicts: run.verdicts,
    attackIds: run.records.map((record) => record.attackId),
    streamUrl: `/api/runs/${run.runId}/stream`,
  };
}

export function runErrorResponse(error: unknown): Response {
  if (error instanceof RunConflictError) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof RunRequestError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof RunLimitError) {
    return Response.json({ error: error.message }, { status: 429 });
  }
  throw error;
}

/** A run's own id, or the name of a recording. */
async function findRun(id: string): Promise<RunState | null> {
  return (await getRunManager().get(id)) ?? (await loadReplay(id));
}

export async function findPatch(id: string) {
  const run = await findRun(id);
  return run && isOver(run.status) ? generatePatch(run, id) : null;
}

export async function loadPatch(id: string): Promise<Response> {
  const run = await findRun(id);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  if (!isOver(run.status)) {
    return Response.json({ error: "The run has not finished" }, { status: 409 });
  }
  const patch = generatePatch(run, id);
  return patch
    ? Response.json(patch)
    : Response.json({ error: "The run leaked nothing, so there is nothing to patch" }, { status: 422 });
}
