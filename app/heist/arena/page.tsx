import type { Metadata } from "next";
import { listReplayIds } from "@/lib/heist-replays";
import { Arena } from "./arena";

export const metadata: Metadata = { title: "Heist · Arena" };
export const dynamic = "force-dynamic";

export default async function ArenaPage() {
  const replays = await listReplayIds();
  // The license key stays optional: without it AG Studio runs with its trial watermark.
  return <Arena replays={replays} licenseKey={process.env.AG_STUDIO} />;
}
