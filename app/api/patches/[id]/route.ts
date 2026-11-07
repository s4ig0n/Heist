import { loadPatch } from "@/lib/heist-runs";
import { runIdFromPatchId } from "@/packages/runner/src/patch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const runId = runIdFromPatchId(id);
  return runId
    ? loadPatch(runId)
    : Response.json({ error: "Patch not found" }, { status: 404 });
}
