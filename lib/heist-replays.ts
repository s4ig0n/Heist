import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { RunState } from "@/packages/runner/src/run-manager";

const RECORDED_DIR = path.join(process.cwd(), "packages", "fixtures", "recorded");
const SAFE_ID = /^[A-Za-z0-9-]{1,120}$/;

export async function listReplayIds(): Promise<string[]> {
  const files = await readdir(/*turbopackIgnore: true*/ RECORDED_DIR).catch(() => []);
  return files
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length));
}

export async function loadReplay(id: string): Promise<RunState | null> {
  if (!SAFE_ID.test(id)) return null;
  const file = path.join(RECORDED_DIR, `${id}.json`);
  return readFile(/*turbopackIgnore: true*/ file, "utf8").then(
    (content) => JSON.parse(content) as RunState,
    () => null
  );
}
