import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s · Heist", default: "Heist · AI agent red-team cockpit" },
  description: "Find, verify, and deterministically block out-of-policy refunds from AI support agents in the PayPal sandbox.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
