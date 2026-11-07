import { listReplayIds } from "@/lib/heist-replays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ replays: await listReplayIds() });
}
