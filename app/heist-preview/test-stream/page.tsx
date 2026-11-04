
"use client";

import { useEffect, useRef, useState } from "react";
import { heistColors as c } from "../heist-theme";

type MockEvent = {
  eventId: string;
  type: string;
  attackId: string;
  persona?: string;
  status?: string;
  amountCents?: number;
  tool?: string;
};

export default function TestStreamPage() {
  const [events, setEvents] = useState<MockEvent[]>([]);
  const [speed, setSpeed] = useState<1 | 4>(1);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");
  const sourceRef = useRef<EventSource | null>(null);

  const stop = () => {
    sourceRef.current?.close();
    sourceRef.current = null;
    setRunning(false);
  };

  const play = () => {
    stop();
    setEvents([]);
    setFinished(false);
    setError("");
    setRunning(true);

    const source = new EventSource(
      `/heist-preview/stream?speed=${speed}`
    );

    sourceRef.current = source;

    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as MockEvent;
      setEvents((previous) => [...previous, event]);
    };

    source.addEventListener("replay.finished", () => {
      source.close();
      sourceRef.current = null;
      setRunning(false);
      setFinished(true);
    });

    source.onerror = () => {
      source.close();
      sourceRef.current = null;
      setRunning(false);
      setError("Stream disconnected or failed.");
    };
  };

  useEffect(() => {
    return () => {
      sourceRef.current?.close();
    };
  }, []);

  const completed = events.filter(
    (event) => event.type === "attack.completed"
  );

  const leaks = completed.filter(
    (event) => event.status === "leak"
  );

  const leakedCents = leaks.reduce(
    (total, event) => total + (event.amountCents ?? 0),
    0
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: c.background,
        color: c.text,
        padding: 32,
      }}
    >
      <h1 style={{ fontSize: 30, fontWeight: 700 }}>
        HEIST / MOCK STREAM TEST
      </h1>

      <p style={{ color: c.textMuted }}>
        Simulated events only. No PayPal transactions.
      </p>

      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <button
          onClick={play}
          disabled={running}
          style={{
            padding: "10px 20px",
            background: c.gold,
            color: c.background,
            borderRadius: 8,
          }}
        >
          Play
        </button>

        <button
          onClick={stop}
          disabled={!running}
          style={{
            padding: "10px 20px",
            border: `1px solid ${c.border}`,
            borderRadius: 8,
          }}
        >
          Stop
        </button>

        <select
          value={speed}
          disabled={running}
          onChange={(event) =>
            setSpeed(Number(event.target.value) as 1 | 4)
          }
          style={{
            background: c.surface,
            color: c.text,
            padding: 10,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
          }}
        >
          <option value={1}>1×</option>
          <option value={4}>4×</option>
        </select>
      </div>

      <div
        aria-live="polite"
        style={{ marginTop: 20, color: c.gold }}
      >
        {error
          ? error
          : finished
          ? "Replay finished"
          : running
          ? "Replaying events..."
          : "Ready"}
      </div>

      <div
        style={{
          display: "flex",
          gap: 24,
          marginTop: 24,
        }}
      >
        <p>Events: {events.length}</p>
        <p>Completed attacks: {completed.length}/50</p>
        <p>Leaks: {leaks.length}</p>
        <p>Mock leaked: ${(leakedCents / 100).toFixed(2)}</p>
      </div>

      <section
        style={{
          marginTop: 24,
          background: c.surface,
          borderRadius: 8,
          padding: 20,
          maxHeight: 450,
          overflowY: "auto",
        }}
      >
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>
          Incoming events
        </h2>

        {events.map((event) => (
          <div
            key={event.eventId}
            style={{
              padding: 10,
              borderBottom: `1px solid ${c.border}`,
            }}
          >
            <strong style={{ color: c.gold }}>
              {event.type}
            </strong>{" "}
            <span style={{ color: c.textMuted }}>
              {event.attackId}
            </span>
            {event.persona && ` · ${event.persona}`}
            {event.status && ` · ${event.status}`}
            {event.tool && ` · ${event.tool}`}
          </div>
        ))}
      </section>
    </main>
  );
}
