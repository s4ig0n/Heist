
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

export async function GET(request: Request) {
  if (process.env.DATA_MODE !== "mock") {
    return Response.json(
      { error: "Mock mode is disabled" },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const speed = url.searchParams.get("speed") === "4" ? 4 : 1;

  const fixturePath = path.join(
    process.cwd(),
    "packages",
    "fixtures",
    "mock",
    "attacks.ndjson"
  );

  let events: unknown[];

  try {
    const content = await readFile(fixturePath, "utf8");

    events = content
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch (error) {
    console.error("Fixture error:", error);

    return Response.json(
      { error: "Unable to load attacks.ndjson" },
      { status: 500 }
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const event of events) {
        if (request.signal.aborted) break;

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify(event)}\n\n`
          )
        );

        await new Promise<void>((resolve) =>
          setTimeout(resolve, 1000 / speed)
        );
      }

      if (!request.signal.aborted) {
        controller.enqueue(
          encoder.encode(
            `event: replay.finished\ndata: {}\n\n`
          )
        );
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
