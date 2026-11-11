// Shared frame for the Heist cockpit pages: title, nav, sandbox notice.

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { heistColors as c } from "@/app/heist/heist-theme";

const PAGES = [
  { id: "arena", label: "Arena", href: "/heist/arena" },
  { id: "replay", label: "Attack Replay", href: "/heist/replay" },
  { id: "report", label: "Report", href: "/heist/report" },
] as const;

export type HeistPage = (typeof PAGES)[number]["id"];

export function HeistShell({ page, children, scroll = false }: { page: HeistPage; children: ReactNode; scroll?: boolean }) {
  const current = PAGES.find((p) => p.id === page)!;
  return (
    <main
      className="heist-shell"
      style={{
        height: scroll ? undefined : "100vh",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: c.background,
        color: c.text,
        fontFamily: 'Archivo, "Arial Narrow", system-ui, sans-serif',
      }}
    >
      <header className="heist-header" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 24, padding: "14px 16px", borderBottom: `1px solid ${c.border}` }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, fontStretch: "125%", letterSpacing: 1, display: "flex", alignItems: "baseline", gap: 12 }}>
          <Link href="/" style={{ color: c.text, textDecoration: "none" }} aria-label="Heist home">
            HEIST<span style={{ color: c.gold }}>.</span>
          </Link>
          <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: "italic", fontWeight: 400, fontStretch: "100%", letterSpacing: 0, color: c.textMuted }}>
            {current.label.toLowerCase()}
          </span>
        </h1>
        <nav aria-label="Heist" style={{ display: "flex", gap: 18, fontSize: 14 }}>
          {PAGES.map((p) => (
            <Link
              key={p.id}
              href={p.href}
              aria-current={p.id === page ? "page" : undefined}
              style={{ color: p.id === page ? c.gold : c.textMuted, textDecoration: p.id === page ? "underline" : "none", textUnderlineOffset: 6 }}
            >
              {p.label}
            </Link>
          ))}
        </nav>
        <span className="heist-sandbox-note" style={{ marginLeft: "auto", fontSize: 12, color: c.textMuted }}>PayPal sandbox only · no real money</span>
      </header>
      <style>{`main code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; }`}</style>
      {children}
    </main>
  );
}

export const panel: CSSProperties = {
  background: c.surface,
  border: `1px solid ${c.border}`,
  borderRadius: 8,
  padding: 16,
};

export const control: CSSProperties = {
  background: c.surfaceRaised,
  color: c.text,
  border: `1px solid ${c.border}`,
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 13,
};

export const heading: CSSProperties = { fontSize: 12, letterSpacing: 2, color: c.gold, fontWeight: 700, marginBottom: 12 };

export const REPLAY_LABEL: Record<string, string> = {
  "baseline-run": "Nimbus as shipped (no guard)",
  "guarded-run": "Nimbus with the Heist guard",
  "hero-run": "Hero run",
  "patched-run": "Patched rerun",
  "trojan-note-plain": "Case study: Trojan Note, plain Nimbus",
  "trojan-note-guarded": "Case study: Trojan Note, with the guard",
};
