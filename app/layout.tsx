import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s · Heist", default: "Heist · AI agent red-team cockpit" },
  description: "Find, verify, and deterministically block out-of-policy refunds from AI support agents in the PayPal sandbox.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Loaded at runtime, so the production build needs no network access for fonts. The root
            layout wraps every route, so the Pages Router warning about single-page fonts does not apply. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,400..900&family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@400;600&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
