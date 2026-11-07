import { loadReplay } from "@/lib/heist-replays";
import {
  createReplayResponse,
  parseLastEventId,
} from "@/packages/runner/src/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPEEDS = [1, 4, 16];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const replay = await loadReplay(id);
  if (!replay) {
    return Response.json({ error: "Replay not found" }, { status: 404 });
  }

  const requested = Number(new URL(request.url).searchParams.get("speed"));
  return createReplayResponse(replay, {
    speed: SPEEDS.includes(requested) ? requested : 1,
    lastEventId: parseLastEventId(request.headers.get("last-event-id")),
    signal: request.signal,
  });
}
