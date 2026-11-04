
import { Dashboard } from "../dashboard/dashboard";
import type { DashboardData } from "@/lib/dashboard-data";

export default function HeistPreviewPage() {
  const mockData = {
    asOf: new Date().toISOString(),
    customers: [],
    invoices: [],
    invoiceItems: [],
    invoicePayments: [],
    products: [
      {
        id: "HEIST-001",
        name: "Nimbus Outfitters",
        type: "PHYSICAL",
        category: "MERCHANDISE",
        description: "Heist mock merchant",
      },
    ],
    plans: [],
    transactions: [],
    payouts: [],
    balances: [],
  } satisfies DashboardData;

  return (
    <Dashboard
      data={mockData}
      licenseKey={undefined}
    />
  );
}
