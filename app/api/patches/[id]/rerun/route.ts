import {
  findPatch,
  getRunManager,
  refuseRunStart,
  runErrorResponse,
  runView,
} from "@/lib/heist-runs";
import { runIdFromPatchId } from "@/packages/runner/src/patch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Runs the same personas again with only the patch's rules switched on.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const refused = refuseRunStart(request);
  if (refused) return refused;

  const { id } = await params;
  const runId = runIdFromPatchId(id);
  const patch = runId ? await findPatch(runId) : null;
  if (!patch) {
    return Response.json({ error: "Patch not found" }, { status: 404 });
  }

  try {
    const run = getRunManager().start({
      personaIds: patch.personaIds,
      scripted: patch.scripted,
      guardRules: patch.after,
      patchId: patch.patchId,
    });
    return Response.json(runView(run), { status: 202 });
  } catch (error) {
    return runErrorResponse(error);
  }
}
