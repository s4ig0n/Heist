import type { Metadata } from "next";
import { Report } from "./report";

export const metadata: Metadata = { title: "Heist · Report" };
export const dynamic = "force-dynamic";

export default function ReportPage() {
  // Without a license key AG Studio runs with its trial watermark.
  return <Report licenseKey={process.env.AG_STUDIO} />;
}
