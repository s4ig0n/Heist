import { getRunManager, runView } from "@/lib/heist-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const run = await getRunManager().get(id);

  return run
    ? Response.json(runView(run))
    : Response.json({ error: "Run not found" }, { status: 404 });
}
