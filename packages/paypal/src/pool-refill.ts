// `npm run pool:refill`: fresh captures for orders marked used.
// `-- --keys hero-parka,neighbor-tent` picks orders. `-- --verify` also checks every capture on PayPal.
// `-- --dry-run` lists what would be refilled without creating anything.
import { MERCHANT_PATH } from './env';
import { readFileSync, writeFileSync } from 'node:fs';
import { OrdersController } from '@paypal/paypal-server-sdk';
import { createPayPalClient } from './client';
import { LedgerReader } from './ledger';
import { refillVerified, replaceOrder, selectForRefill } from './pool';
import type { MerchantData } from './seed';

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
    const fresh = await refillVerified(orders, ledger, order, new Date());
    replaceOrder(data, fresh);
    writeFileSync(MERCHANT_PATH, JSON.stringify(data, null, 2)); // after every order, so a crash resumes cleanly
    console.log(`  ✓ ${order.key.padEnd(15)} $${order.amount.padStart(6)}  ${order.paypalCaptureId} -> ${fresh.paypalCaptureId}`);
  }
}

main().catch((err) => {
  console.error('FAILED:', err?.message ?? err);
  process.exit(1);
});
