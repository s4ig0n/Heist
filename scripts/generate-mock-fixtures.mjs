
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.join(
  process.cwd(),
  "packages",
  "fixtures",
  "mock"
);

const personas = [
  {
    name: "Trojan Note",
    technique: "indirect_prompt_injection",
    ruleId: "untrusted_fields.quarantine",
  },
  {
    name: "Tool Whisperer",
    technique: "missing_refund_amount",
    ruleId: "refund.explicit_amount",
  },
  {
    name: "Neighbor",
    technique: "cross_customer_refund",
    ruleId: "refund.ownership",
  },
  {
    name: "Honest Hannah",
    technique: "legitimate_refund",
    ruleId: null,
  },
];

const events = [];

const start = Date.parse("2026-10-28T18:00:00Z");

for (let i = 0; i < 50; i++) {
  const persona = personas[i % personas.length];
  const attackId = `attack-${String(i + 1).padStart(3, "0")}`;
  const isHero = i === 0;
  const isHonest = persona.name === "Honest Hannah";

  const amountCents = isHero
    ? 48000
    : isHonest
      ? 8000
      : (50 + (i % 8) * 25) * 100;

  const status = isHonest
    ? "allowed"
    : i % 3 === 0
      ? "leak"
      : "blocked";

  const timestamp = new Date(start + i * 4000).toISOString();

  events.push({
    eventId: `evt-${attackId}-start`,
    runId: "run-mock-001",
    attackId,
    timestamp,
    verification: "mock",
    type: "attack.started",
    persona: persona.name,
    technique: persona.technique,
  });

  events.push({
    eventId: `evt-${attackId}-tool`,
    runId: "run-mock-001",
    attackId,
    timestamp: new Date(start + i * 4000 + 1000).toISOString(),
    verification: "mock",
    type: "tool.called",
    tool: isHonest ? "get_order" : "create_refund",
    args: { amountCents },
  });

  events.push({
    eventId: `evt-${attackId}-complete`,
    runId: "run-mock-001",
    attackId,
    timestamp: new Date(start + i * 4000 + 2000).toISOString(),
    verification: "mock",
    type: "attack.completed",
    persona: persona.name,
    status,
    amountCents: status === "leak" ? amountCents : 0,
    currency: "USD",
    ruleIds: persona.ruleId ? [persona.ruleId] : [],
  });
}

await mkdir(outputDir, { recursive: true });

await writeFile(
  path.join(outputDir, "attacks.ndjson"),
  events.map((event) => JSON.stringify(event)).join("\n") + "\n",
  "utf8"
);

console.log(`Generated 50 mock attacks and ${events.length} events.`);
console.log("Saved to packages/fixtures/mock/attacks.ndjson");
