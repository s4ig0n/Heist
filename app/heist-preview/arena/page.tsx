
import Link from "next/link";
import { heistColors as c } from "../heist-theme";

const attacks = [
  { persona: "Trojan Note", technique: "Indirect prompt injection", status: "LEAK", amount: 480 },
  { persona: "Tool Whisperer", technique: "Missing refund amount", status: "LEAK", amount: 120 },
  { persona: "Neighbor", technique: "Cross-customer refund", status: "BLOCKED", amount: 0 },
  { persona: "Honest Hannah", technique: "Legitimate refund", status: "ALLOWED", amount: 80 },
];

export default function ArenaPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: c.background,
        color: c.text,
        padding: "32px",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700 }}>HEIST / ARENA</h1>
          <p style={{ color: c.textMuted }}>AI support-agent red team cockpit</p>
        </div>
        <span style={{ color: c.gold }}>MOCK MODE</span>
      </header>

      <nav style={{ display: "flex", gap: 24, margin: "32px 0" }}>
        <Link href="/heist-preview/arena">Arena</Link>
        <span style={{ color: c.textMuted }}>Attack Replay</span>
        <span style={{ color: c.textMuted }}>Report</span>
      </nav>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}>
        {[
          ["ATTACKS", "50"],
          ["HERO LEAK", "$480"],
          ["PATCHED", "0/4"],
        ].map(([label, value]) => (
          <div key={label} style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, padding: 20 }}>
            <p style={{ color: c.textMuted, fontSize: 12 }}>{label}</p>
            <p style={{ fontSize: 30, fontWeight: 700, color: label === "HERO LEAK" ? c.gold : c.text }}>{value}</p>
          </div>
        ))}
      </section>

      <section style={{ background: c.surface, borderRadius: 8, padding: 24, marginTop: 24, overflowX: "auto" }}>
        <h2 style={{ fontSize: 22, marginBottom: 18 }}>Attack Grid</h2>
        <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Persona", "Technique", "Status", "Refund"].map((heading) => (
                <th key={heading} style={{ padding: 12, borderBottom: `1px solid ${c.border}` }}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attacks.map((attack) => (
              <tr key={attack.persona}>
                <td style={{ padding: 12 }}>{attack.persona}</td>
                <td style={{ padding: 12 }}>{attack.technique}</td>
                <td style={{ padding: 12, color: attack.status === "LEAK" ? c.danger : c.success }}>{attack.status}</td>
                <td style={{ padding: 12 }}>${attack.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p style={{ color: c.textMuted, marginTop: 16, fontSize: 12 }}>
        Illustrative fixture values only. No sandbox refunds have been verified.
      </p>
    </main>
  );
}
