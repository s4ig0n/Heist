import { loadReplay } from "@/lib/heist-replays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const replay = await loadReplay(id);
  if (!replay) {
    return Response.json({ error: "Replay not found" }, { status: 404 });
  }

  const { runId, status, personaIds, guarded, startedAt, finishedAt, score, verdicts, records } = replay;
  return Response.json({
    id,
    runId,
    status,
    personaIds,
    guarded,
    startedAt,
    finishedAt,
    score,
    verdicts,
    records,
    streamUrl: `/api/replays/${id}/stream`,
  });
}
