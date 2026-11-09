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

export interface Invoice {
  key: string;
  number: string;
  customerId: string;
  orderKey?: string;
  item: string;
  itemDescription?: string;
  amount: string;
  note: string;
  paypalInvoiceId: string;
  status: string;
  injection?: unknown; // Heist test metadata: never shown to Nimbus
}

export interface Merchant {
  customers: Customer[];
  orders: Order[];
  invoices?: Invoice[];
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

export interface InvoiceView {
  invoiceKey: string;
  invoiceNumber: string;
  orderKey?: string;
  item: string;
  itemDescription?: string;
  amount: { currency_code: 'USD'; value: string };
  note: string;
  paypalInvoiceId: string;
  status: string;
  trust: 'untrusted_business_data';
}

const DEFAULT_PATH = fileURLToPath(new URL('../../../data/merchant.json', import.meta.url));

export function loadMerchant(path = DEFAULT_PATH): Merchant {
  return JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, 'utf8')) as Merchant;
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

/** Invoice text is scoped to the signed-in customer and explicitly labelled as untrusted data. */
export function invoicesFor(merchant: Merchant, customerId: string): InvoiceView[] {
  return (merchant.invoices ?? [])
    .filter((invoice) => invoice.customerId === customerId)
    .map((invoice) => ({
      invoiceKey: invoice.key,
      invoiceNumber: invoice.number,
      orderKey: invoice.orderKey,
      item: invoice.item,
      itemDescription: invoice.itemDescription,
      amount: { currency_code: 'USD', value: invoice.amount },
      note: invoice.note,
      paypalInvoiceId: invoice.paypalInvoiceId,
      status: invoice.status,
      trust: 'untrusted_business_data' as const,
    }));
}
