import { isOver, type RunManager, type RunState, type StreamItem } from './run-manager';

const encoder = new TextEncoder();
export const HEARTBEAT_MS = 15_000;
const STREAM_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
};

/**
 * Contract events go out as plain `data:` messages, the same as the mock stream, so the same client code reads
 * both. Run-level items use named events. `id` is the item's position, which lets a browser resume after a drop.
 */
export function formatItem(item: StreamItem, index: number): string {
  const id = `id: ${index + 1}\n`;
  if (item.kind === 'event') return `${id}data: ${JSON.stringify(item.event)}\n\n`;
  if (item.kind === 'status') {
    return `${id}event: run.status\ndata: ${JSON.stringify({ status: item.status, message: item.message })}\n\n`;
  }
  return `${id}event: run.summary\ndata: ${JSON.stringify(item.score)}\n\n`;
}

export const parseLastEventId = (value: string | null | undefined): number => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

/** Returns null for an unknown run. A finished run the client has fully read gets 204, which stops EventSource retrying. */
export async function createRunStreamResponse(
  manager: RunManager,
  runId: string,
  opts: { lastEventId?: number; signal?: AbortSignal; heartbeatMs?: number } = {},
): Promise<Response | null> {
  const run = await manager.get(runId);
  if (!run) return null;
  const from = opts.lastEventId ?? 0;
  if (isOver(run.status) && from >= run.items.length) return new Response(null, { status: 204 });

  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try { controller.close(); } catch { /* the client already went away */ }
      };
      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };

      // Subscribing and replaying happen in one tick, so nothing can slip between them.
      const unsubscribe = manager.subscribe(runId, (item, index) => {
        send(formatItem(item, index));
        if (item.kind === 'status' && isOver(item.status)) close();
      });
      const heartbeat = setInterval(() => send(': ping\n\n'), opts.heartbeatMs ?? HEARTBEAT_MS);
      cleanup = () => {
        unsubscribe();
        clearInterval(heartbeat);
      };
      opts.signal?.addEventListener('abort', close);

      run.items.slice(from).forEach((item, i) => send(formatItem(item, from + i)));
      if (isOver(run.status)) close();
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, { headers: STREAM_HEADERS });
}

const MAX_REPLAY_GAP_MS = 2_000;
const STATUS_GAP_MS = 300;

/** How long to wait before an item: the real gap between events, capped, so a slow model call doesn't stall a demo. */
export function replayDelayMs(items: StreamItem[], index: number, speed: number): number {
  const item = items[index];
  if (item.kind !== 'event') return STATUS_GAP_MS / speed;
  let previous: string | undefined;
  for (let i = index - 1; i >= 0 && !previous; i--) {
    const earlier = items[i];
    if (earlier.kind === 'event') previous = earlier.event.timestamp;
  }
  if (!previous) return STATUS_GAP_MS / speed;
  const gap = new Date(item.event.timestamp).getTime() - new Date(previous).getTime();
  return Math.min(Math.max(gap, 0), MAX_REPLAY_GAP_MS) / speed;
}

/** Plays a finished run back at its recorded pace. A browser that has seen it all gets 204. */
export function createReplayResponse(
  run: Pick<RunState, 'items'>,
  opts: { speed?: number; lastEventId?: number; signal?: AbortSignal } = {},
): Response {
  const from = opts.lastEventId ?? 0;
  if (from >= run.items.length + 1) return new Response(null, { status: 204 });
  const speed = opts.speed ?? 1;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (let i = from; i < run.items.length; i++) {
        await new Promise<void>((resolve) => setTimeout(resolve, replayDelayMs(run.items, i, speed)));
        if (opts.signal?.aborted) break;
        controller.enqueue(encoder.encode(formatItem(run.items[i], i)));
      }
      if (!opts.signal?.aborted) {
        controller.enqueue(encoder.encode(`id: ${run.items.length + 1}\nevent: replay.finished\ndata: {}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: STREAM_HEADERS });
}
