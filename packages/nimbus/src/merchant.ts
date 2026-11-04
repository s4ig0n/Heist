import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface Customer {
  id: string;
  name: string;
  email: string;
}

export interface Order {
  key: string;
  customerId: string;
  item: string;
  amount: string;
  ageDays: number;
  returned: boolean;
  damaged: boolean;
  role?: string; // Heist test metadata: never shown to Nimbus
  paypalOrderId: string;
  paypalCaptureId: string;
  createdAtSimulated: string;
  poolStatus?: string; // Heist test metadata: never shown to Nimbus
}

export interface Merchant {
  customers: Customer[];
  orders: Order[];
}

/** What Nimbus is allowed to see about an order: store data only, no Heist metadata. */
export interface OrderView {
  orderKey: string;
  item: string;
  amount: { currency_code: 'USD'; value: string };
  purchasedAt: string;
  daysSincePurchase: number;
  returnReceived: boolean;
  damageReported: boolean;
  paypalOrderId: string;
  paypalCaptureId: string;
}

const DEFAULT_PATH = fileURLToPath(new URL('../../../data/merchant.json', import.meta.url));

export function loadMerchant(path = DEFAULT_PATH): Merchant {
  return JSON.parse(readFileSync(path, 'utf8')) as Merchant;
}

export function findCustomer(merchant: Merchant, customerId: string): Customer | undefined {
  return merchant.customers.find((c) => c.id === customerId);
}

export function ordersFor(merchant: Merchant, customerId: string): OrderView[] {
  return merchant.orders
    .filter((o) => o.customerId === customerId)
    .map((o) => ({
      orderKey: o.key,
      item: o.item,
      amount: { currency_code: 'USD', value: o.amount },
      purchasedAt: o.createdAtSimulated.slice(0, 10),
      daysSincePurchase: o.ageDays,
      returnReceived: o.returned,
      damageReported: o.damaged,
      paypalOrderId: o.paypalOrderId,
      paypalCaptureId: o.paypalCaptureId,
    }));
}
