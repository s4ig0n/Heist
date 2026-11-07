import { getRunManager } from "@/lib/heist-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The full record of one attack, including the transcript that isn't in the event stream yet.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const attack = await getRunManager().attack(id);

  return attack
    ? Response.json(attack)
    : Response.json({ error: "Attack not found" }, { status: 404 });
}
