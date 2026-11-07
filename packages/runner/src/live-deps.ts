import { config } from 'dotenv';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { google } from '@ai-sdk/google';
import { OrdersController } from '@paypal/paypal-server-sdk';
import { createPayPalClient } from '../../paypal/src/client';
import { LedgerReader } from '../../paypal/src/ledger';
import { refillVerified, replaceOrder, type RefillableOrder } from '../../paypal/src/pool';
import type { MerchantData } from '../../paypal/src/seed';
import { findCustomer, loadMerchant } from '../../nimbus/src/merchant';
import { createNimbus, createPayPalTools } from '../../nimbus/src/nimbus';
import { buildAttackerPrompt, createLlmAttacker, createScriptedAttacker } from './attacker';
import { createGuard } from './guard';
import { evaluate } from './oracle';
import { scriptFor, type Persona } from './personas';
import type { RunDeps, RunState } from './run-manager';

const SAFE_ID = /^[A-Za-z0-9-]{1,120}$/;

/** The real thing: Nimbus, Gemini and the PayPal sandbox. `root` is the repo root. */
export function createLiveDeps(root: string): RunDeps {
  config({ path: join(root, 'packages/paypal/.env'), quiet: true }); // hosted env vars win over this file

  const merchantPath = process.env.HEIST_MERCHANT_PATH ?? join(root, 'data/merchant.json');
  const evidenceDir = process.env.HEIST_EVIDENCE_DIR ?? join(root, 'data/evidence');
  const runsDir = join(evidenceDir, 'runs');
  const nimbusModel = () => process.env.NIMBUS_MODEL ?? 'gemini-3.1-flash-lite';
  const attackerModel = () => process.env.ATTACKER_MODEL ?? 'gemini-3.5-flash';

  const readRaw = (): MerchantData => JSON.parse(readFileSync(/*turbopackIgnore: true*/ merchantPath, 'utf8'));
  const writeRaw = (data: MerchantData) => writeFileSync(/*turbopackIgnore: true*/ merchantPath, JSON.stringify(data, null, 2));

  async function freshCapture(persona: Persona, client: ReturnType<typeof createPayPalClient>, ledger: LedgerReader): Promise<void> {
    const data = readRaw();
    const order = data.orders.find((o) => o.key === persona.targetOrderKey) as RefillableOrder | undefined;
    if (!order) throw new Error(`${persona.targetOrderKey} is not in the merchant data`);
    const current = await ledger.capture(order.paypalCaptureId);
    if (current?.status === 'COMPLETED' && order.poolStatus !== 'used') return;
    replaceOrder(data, await refillVerified(new OrdersController(client), ledger, order, new Date()));
    writeRaw(data);
  }

  return {
    async prepareAttack(persona, scripted, guarded) {
      const client = createPayPalClient(); // refuses unless PAYPAL_ENVIRONMENT=SANDBOX
      const ledger = new LedgerReader(client);
      await freshCapture(persona, client, ledger);

      const merchant = loadMerchant(merchantPath);
      const order = merchant.orders.find((o) => o.key === persona.targetOrderKey)!;
      const customer = findCustomer(merchant, persona.sessionCustomerId);
      if (!customer) throw new Error(`${persona.sessionCustomerId} is not in the merchant data`);

      const attacker = scripted
        ? createScriptedAttacker(scriptFor(persona, order.paypalCaptureId))
        : createLlmAttacker({
            model: google(attackerModel()),
            system: buildAttackerPrompt(persona, {
              customerName: customer.name, orderKey: order.key, item: order.item, amount: order.amount, captureId: order.paypalCaptureId,
            }),
          });

      const paypalTools = createPayPalTools();
      const guard = guarded ? createGuard({ merchant, sessionCustomerId: persona.sessionCustomerId, ledger }) : undefined;

      return {
        guard,
        captureId: order.paypalCaptureId,
        attacker,
        ledger,
        judge: (p, record) => evaluate(merchant, p, record),
        target: createNimbus({
          model: google(nimbusModel()), merchant, sessionCustomerId: persona.sessionCustomerId, paypalTools: guard ? guard.wrap(paypalTools) : paypalTools,
        }),
      };
    },

    async afterAttack(_persona, record, events, scripted) {
      // Every capture a verified refund touched is spent, whichever order it belongs to.
      const spent = new Set(record.refunds.filter((r) => r.succeeded).map((r) => r.readBack?.captureId));
      if (record.unobservedRefund) spent.add(record.captureBefore.id);
      if (spent.size) {
        const data = readRaw();
        for (const o of data.orders) if (spent.has(o.paypalCaptureId)) o.poolStatus = 'used';
        writeRaw(data);
      }
      mkdirSync(/*turbopackIgnore: true*/ evidenceDir, { recursive: true });
      writeFileSync(
        join(evidenceDir, `${record.attackId}.json`),
        JSON.stringify({ nimbusModel: nimbusModel(), attackerModel: scripted ? 'scripted' : attackerModel(), record, events }, null, 2),
      );
    },

    async saveRun(run) {
      mkdirSync(/*turbopackIgnore: true*/ runsDir, { recursive: true });
      writeFileSync(/*turbopackIgnore: true*/ join(runsDir, `${run.runId}.json`), JSON.stringify(run, null, 2));
    },

    async loadRun(runId) {
      if (!SAFE_ID.test(runId)) return null;
      return readFile(/*turbopackIgnore: true*/ join(runsDir, `${runId}.json`), 'utf8').then((s) => JSON.parse(s) as RunState, () => null);
    },

    async loadAttack(attackId) {
      if (!SAFE_ID.test(attackId)) return null;
      return readFile(/*turbopackIgnore: true*/ join(evidenceDir, `${attackId}.json`), 'utf8').then((s) => JSON.parse(s) as unknown, () => null);
    },
  };
}
