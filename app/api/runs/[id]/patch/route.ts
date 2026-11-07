import { loadPatch } from "@/lib/heist-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Works out the guard rules that would have stopped this run's leaks. Spends nothing, so it needs no token.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return loadPatch(id);
}
