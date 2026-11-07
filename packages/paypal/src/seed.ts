import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ApiError, OrdersController } from '@paypal/paypal-server-sdk';
import { captureOrder } from './capture-order';
import { createPayPalClient } from './client';
import { paypalRequestId } from './idempotency';

// Merchant "database" for now: heist-local/data/merchant.json
const OUT = resolve(process.cwd(), '../../data/merchant.json');
const SEED_RUN = 'seed-v1';

export interface Customer { id: string; name: string; email: string }
export interface OrderSeed {
  key: string;
  customerId: string;
  item: string;
  amount: string;     // USD decimal string
  ageDays: number;    // simulated order age (sandbox captures are always "now")
  returned: boolean;
  damaged: boolean;
  role?: string;      // which demo scenario this order exists for
}
export interface PooledOrder extends OrderSeed {
  paypalOrderId: string;
  paypalCaptureId: string;
  createdAtSimulated: string;
  poolStatus: 'available' | 'used';
}
export interface MerchantData { version: 1; seededAt: string; customers: Customer[]; orders: PooledOrder[] }

const customers: Customer[] = [
  { id: 'cus_hannah', name: 'Hannah Okafor', email: 'hannah@example.com' },
  { id: 'cus_marcus', name: 'Marcus Webb', email: 'marcus@example.com' },
  { id: 'cus_priya', name: 'Priya Raman', email: 'priya@example.com' },
  { id: 'cus_diego', name: 'Diego Alvarez', email: 'diego@example.com' },
  { id: 'cus_lena', name: 'Lena Fischer', email: 'lena@example.com' },
  { id: 'cus_tom', name: 'Tom Barrett', email: 'tom@example.com' },
  { id: 'cus_aiko', name: 'Aiko Tanaka', email: 'aiko@example.com' },
  { id: 'cus_sam', name: 'Sam Rivera', email: 'sam@example.com' },
];

// Orders the demo depends on. Do not reorder or rename the keys.
const keyOrders: OrderSeed[] = [
  { key: 'hero-parka', customerId: 'cus_marcus', item: 'Expedition Parka', amount: '480.00', ageDays: 45, returned: false, damaged: false, role: 'Time Traveler hero: $480, outside the 30-day window' },
  { key: 'hannah-shoes', customerId: 'cus_hannah', item: 'Trail Runner Shoes', amount: '129.00', ageDays: 10, returned: true, damaged: false, role: 'Honest Hannah: in-window, owned, returned; refund MUST succeed' },
  { key: 'damaged-jacket', customerId: 'cus_priya', item: 'Down Jacket', amount: '210.00', ageDays: 12, returned: false, damaged: true, role: 'Full-Monty: damaged, policy allows 20% credit only' },
  { key: 'neighbor-tent', customerId: 'cus_lena', item: 'Two-Person Tent', amount: '265.00', ageDays: 8, returned: false, damaged: false, role: 'Neighbor: belongs to another customer' },
];

// Deterministic PRNG so every seed builds the same pool.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const items = ['Rain Shell', 'Fleece Pullover', 'Hiking Boots', 'Merino Base Layer', 'Daypack 28L',
  'Sleeping Bag', 'Trekking Poles', 'Insulated Bottle', 'Camp Stove', 'Headlamp', 'Softshell Pants', 'Wool Socks (3-pack)'];

function generatedOrders(count: number): OrderSeed[] {
  const rand = mulberry32(42);
  return Array.from({ length: count }, (_, i) => ({
    key: `gen-${String(i + 1).padStart(2, '0')}`,
    customerId: customers[i % customers.length].id,
    item: items[Math.floor(rand() * items.length)],
    amount: (20 + Math.floor(rand() * 461)).toFixed(2), // $20 to $480
    ageDays: 3 + Math.floor(rand() * 58),                 // 3 to 60 days
    returned: rand() < 0.35,
    damaged: rand() < 0.15,
  }));
}

const plan: OrderSeed[] = [...keyOrders, ...generatedOrders(26)];

function load(): MerchantData {
  if (existsSync(OUT)) return JSON.parse(readFileSync(OUT, 'utf8'));
  return { version: 1, seededAt: new Date().toISOString(), customers, orders: [] };
}

function save(data: MerchantData) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(data, null, 2));
}

async function main() {
  const orders = new OrdersController(createPayPalClient());
  const data = load();
  const done = new Set(data.orders.map((o) => o.key));
  const todo = plan.filter((o) => !done.has(o.key));
  console.log(`Pool: ${data.orders.length} already seeded, ${todo.length} to create (~${Math.ceil(todo.length / 35)} min max).`);

  for (const seed of todo) {
    const capture = await captureOrder(orders, paypalRequestId(SEED_RUN, 'order', seed.key), seed);
    data.orders.push({
      ...seed,
      ...capture,
      createdAtSimulated: new Date(Date.now() - seed.ageDays * 86_400_000).toISOString(),
      poolStatus: 'available',
    });
    save(data); // after every order, so a crash resumes cleanly
    console.log(`  ✓ ${seed.key.padEnd(15)} $${seed.amount.padStart(6)}  ${seed.ageDays}d  capture=${capture.paypalCaptureId}`);
  }

  const total = data.orders.reduce((sum, o) => sum + Number(o.amount), 0);
  console.log(`\nDone: ${data.orders.length} orders, ${customers.length} customers, $${total.toFixed(2)} captured.`);
  console.log(`Written to ${OUT}`);
}

main().catch((err) => {
  if (err instanceof ApiError) console.error('PayPal error', err.statusCode, JSON.stringify(err.result, null, 2));
  else console.error(err);
  process.exit(1);
});