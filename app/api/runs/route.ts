import { getRunManager, refuseRunStart, runView } from "@/lib/heist-runs";
import {
  RunConflictError,
  RunRequestError,
} from "@/packages/runner/src/run-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ runs: getRunManager().list().map(runView) });
}

// Body: { personas?: string[], scripted?: boolean }. Defaults to every scripted persona.
export async function POST(request: Request) {
  const refused = refuseRunStart(request);
  if (refused) return refused;

  const text = await request.text();
  let body: { personas?: unknown; scripted?: unknown };
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const { personas, scripted } = body ?? {};
  const validPersonas =
    personas === undefined ||
    (Array.isArray(personas) && personas.every((p) => typeof p === "string"));
  if (!validPersonas || (scripted !== undefined && typeof scripted !== "boolean")) {
    return Response.json(
      { error: "personas must be a list of ids and scripted must be true or false" },
      { status: 400 }
    );
  }

  try {
    const run = getRunManager().start({
      personaIds: personas as string[] | undefined,
      scripted: scripted as boolean | undefined,
    });
    return Response.json(runView(run), { status: 202 });
  } catch (error) {
    if (error instanceof RunConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof RunRequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
