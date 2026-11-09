import { aiModels, openAiKey } from "../../../lib/ai";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_OUTPUT_TOKENS = 32_000;

const error = (status: number, message: string) =>
  Response.json({ error: { message } }, { status });

/** Server-side endpoint for the Heist Forensics Analyst. */
export async function POST(request: Request) {
  const apiKey = openAiKey();
  if (!apiKey) {
    return error(503, "The Forensics Analyst is not configured.");
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return error(400, "Request body must be JSON.");
  }

  const models = aiModels();
  const model = typeof body.model === "string" && body.model ? body.model : models[0];
  if (!models.includes(model)) {
    return error(400, `Model "${model}" is not enabled.`);
  }

  const upstream = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ ...body, model, max_output_tokens: MAX_OUTPUT_TOKENS }),
    signal: request.signal,
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
}
