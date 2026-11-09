import { permanentRedirect } from "next/navigation";

export default function LegacyReportPage() {
  permanentRedirect("/heist/report");
}
