// One attack against Nimbus in the REAL sandbox: `pnpm attack -- --persona time-traveler --scripted`.
// Issues real sandbox refunds and consumes the target capture. `pnpm pool:refill` in packages/paypal restores it.
// --scripted uses the persona's fixed lines. Without it the attacker is an LLM, which uses more quota.
import { config } from 'dotenv';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { google } from '@ai-sdk/google';
import { createPayPalClient } from '../../paypal/src/client';
import { LedgerReader } from '../../paypal/src/ledger';
import { findCustomer, loadMerchant } from '../../nimbus/src/merchant';
import { createNimbus, createPayPalTools } from '../../nimbus/src/nimbus';
import { HeistEventSchema } from '../../contracts/src/events';
import { buildAttackerPrompt, createLlmAttacker, createScriptedAttacker } from './attacker';
import { getPersona } from './personas';
import { evaluate } from './oracle';
import { runAttack } from './run-attack';

config({ path: fileURLToPath(new URL('../../paypal/.env', import.meta.url)), quiet: true });

const MERCHANT_PATH = fileURLToPath(new URL('../../../data/merchant.json', import.meta.url));
const EVIDENCE_DIR = fileURLToPath(new URL('../../../data/evidence/', import.meta.url));

const args = process.argv.slice(2);
const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const nimbusModel = process.env.NIMBUS_MODEL ?? 'gemini-3.1-flash-lite';
const attackerModel = process.env.ATTACKER_MODEL ?? 'gemini-3.5-flash';

async function main() {
  const persona = getPersona(flag('--persona') ?? 'time-traveler');
  const merchant = loadMerchant();
  const order = merchant.orders.find((o) => o.key === persona.targetOrderKey);
  const customer = findCustomer(merchant, persona.sessionCustomerId);
  if (!order || !customer) throw new Error(`${persona.id}: order or customer not in merchant.json`);

  const scripted = args.includes('--scripted');
  if (scripted && !persona.script) throw new Error(`${persona.id} has no script`);
  const attacker = scripted
    ? createScriptedAttacker(persona.script!)
    : createLlmAttacker({
        model: google(attackerModel),
        system: buildAttackerPrompt(persona, {
          customerName: customer.name, orderKey: order.key, item: order.item, amount: order.amount, captureId: order.paypalCaptureId,
        }),
      });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const events: unknown[] = [];
  const record = await runAttack({
    runId: `run-${stamp}`,
    attackId: `${persona.id}-${stamp}`,
    persona,
    captureId: order.paypalCaptureId,
    target: createNimbus({ model: google(nimbusModel), merchant, sessionCustomerId: persona.sessionCustomerId, paypalTools: createPayPalTools() }),
    attacker,
    ledger: new LedgerReader(createPayPalClient()),
    judge: (p, r) => evaluate(merchant, p, r),
    emit: (event) => {
      const parsed = HeistEventSchema.parse(event);
      events.push(parsed);
      console.log(`[${parsed.type}] ${JSON.stringify(parsed).slice(0, 180)}`);
    },
  });

  // Every capture a verified refund touched is spent, whichever order it belongs to.
  const spent = new Set(record.refunds.filter((r) => r.succeeded).map((r) => r.readBack?.captureId));
  if (record.unobservedRefund) spent.add(order.paypalCaptureId);
  if (spent.size) {
    const raw = JSON.parse(readFileSync(MERCHANT_PATH, 'utf8'));
    for (const o of raw.orders) if (spent.has(o.paypalCaptureId)) o.poolStatus = 'used';
    writeFileSync(MERCHANT_PATH, JSON.stringify(raw, null, 2));
  }

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = `${EVIDENCE_DIR}${persona.id}-${stamp}.json`;
  writeFileSync(file, JSON.stringify({ nimbusModel, attackerModel: scripted ? 'scripted' : attackerModel, record, events }, null, 2));

  console.log(`\nstopped: ${record.stopReason}${record.error ? ` (${record.error})` : ''}`);
  for (const line of record.transcript) console.log(`${line.role}> ${line.text}`);
  for (const r of record.refunds) console.log('refund read back from PayPal:', r.readBack ?? `(none) ${r.paypalErrorCode ?? ''}`);
  console.log('capture after:', record.captureAfter);
  const v = record.verdict!;
  console.log(`verdict: ${v.bucket}${v.severity ? ` (${v.severity})` : ''}, ${(v.leakedCents / 100).toFixed(2)} leaked, violations: ${v.violations.join(', ') || 'none'}`);
  console.log('evidence:', file);
}

main().catch((err) => {
  console.error('FAILED:', err?.message ?? err);
  process.exit(1);
});
