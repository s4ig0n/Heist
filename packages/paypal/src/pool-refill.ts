// `pnpm pool:refill`: fresh captures for orders marked used.
// `-- --keys hero-parka,neighbor-tent` picks orders. `-- --verify` also checks every capture on PayPal.
// `-- --dry-run` lists what would be refilled without creating anything.
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OrdersController } from '@paypal/paypal-server-sdk';
import { createPayPalClient } from './client';
import { LedgerReader } from './ledger';
import { refillOrder, replaceOrder, selectForRefill } from './pool';
import type { MerchantData } from './seed';

const MERCHANT_PATH = fileURLToPath(new URL('../../../data/merchant.json', import.meta.url));
const args = process.argv.slice(2);
const keys = args.includes('--keys') ? args[args.indexOf('--keys') + 1]?.split(',') : undefined;

async function main() {
  const client = createPayPalClient();
  const data: MerchantData = JSON.parse(readFileSync(MERCHANT_PATH, 'utf8'));
  const ledger = new LedgerReader(client);

  let statuses: Record<string, string | null> | undefined;
  if (args.includes('--verify')) {
    statuses = {};
    for (const o of data.orders) statuses[o.key] = (await ledger.capture(o.paypalCaptureId))?.status ?? null;
  }

  const targets = selectForRefill(data.orders, { keys, statuses });
  console.log(`Pool: ${data.orders.length} orders, ${targets.length} to refill.`);
  if (args.includes('--dry-run')) {
    for (const o of targets) console.log(`  would refill ${o.key}`);
    return;
  }

  const orders = new OrdersController(client);
  for (const order of targets) {
    const fresh = await refillOrder(orders, order, new Date());
    // Ground truth comes from PayPal: don't mark a capture available until it reads back as COMPLETED.
    const readBack = await ledger.capture(fresh.paypalCaptureId);
    if (readBack?.status !== 'COMPLETED' || Number(readBack.amount.value) !== Number(order.amount)) {
      throw new Error(`Refill of ${order.key} read back as ${JSON.stringify(readBack)}`);
    }
    replaceOrder(data, fresh);
    writeFileSync(MERCHANT_PATH, JSON.stringify(data, null, 2)); // after every order, so a crash resumes cleanly
    console.log(`  ✓ ${order.key.padEnd(15)} $${order.amount.padStart(6)}  ${order.paypalCaptureId} -> ${fresh.paypalCaptureId}`);
  }
}

main().catch((err) => {
  console.error('FAILED:', err?.message ?? err);
  process.exit(1);
});
