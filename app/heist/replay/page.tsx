import type { Metadata } from "next";
import { listReplayIds } from "@/lib/heist-replays";
import { AttackReplay } from "./attack-replay";

export const metadata: Metadata = { title: "Heist · Attack Replay" };
export const dynamic = "force-dynamic";

export default async function ReplayPage({ searchParams }: { searchParams: Promise<{ run?: string; attack?: string }> }) {
  const [{ run, attack }, replays] = await Promise.all([searchParams, listReplayIds()]);
  return <AttackReplay replays={replays} initialRun={run} initialAttack={attack} />;
}
