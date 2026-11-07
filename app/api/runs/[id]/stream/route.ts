import { getRunManager } from "@/lib/heist-runs";
import {
  createRunStreamResponse,
  parseLastEventId,
} from "@/packages/runner/src/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const response = await createRunStreamResponse(getRunManager(), id, {
    lastEventId: parseLastEventId(request.headers.get("last-event-id")),
    signal: request.signal,
  });

  return response ?? Response.json({ error: "Run not found" }, { status: 404 });
}
