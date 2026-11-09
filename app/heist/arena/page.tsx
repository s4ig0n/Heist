import type { Metadata } from "next";
import { listReplayIds } from "@/lib/heist-replays";
import { Arena } from "./arena";

export const metadata: Metadata = { title: "Heist · Arena" };
export const dynamic = "force-dynamic";

const LIVE_STREAM = /^\/api\/runs\/[A-Za-z0-9-]{1,120}\/stream$/;

export default async function ArenaPage({ searchParams }: { searchParams: Promise<{ replay?: string; stream?: string }> }) {
  const [{ replay, stream }, replays] = await Promise.all([searchParams, listReplayIds()]);
  // Only our own live-run stream URLs are accepted from the query string.
  const liveStream = stream && LIVE_STREAM.test(stream) ? stream : undefined;
  const initialReplay = replay && replays.includes(replay) ? replay : undefined;
  // The license key stays optional: without it AG Studio runs with its trial watermark.
  return <Arena replays={replays} initialReplay={initialReplay} liveStream={liveStream} licenseKey={process.env.AG_STUDIO} />;
}
