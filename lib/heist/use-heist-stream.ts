"use client";

// Subscribes to a Heist SSE stream and keeps the reduced cockpit state.
// Works for a replay (/api/replays/:id/stream?speed=4) and a live run (/api/runs/:id/stream) alike:
// contract events arrive as plain `data:` messages, run-level items as named events.

import { useEffect, useReducer } from "react";
import { applyItem, initialHeistState, type HeistState, type RunScore, type RunStatus, type StreamItem } from "./stream-state";

type Action = { type: "reset" } | { type: "item"; item: StreamItem };

function reducer(state: HeistState, action: Action): HeistState {
  if (action.type === "reset") return { ...initialHeistState, status: "connecting" };
  return applyItem(state, action.item);
}

export function useHeistStream(url: string | null): HeistState {
  const [state, dispatch] = useReducer(reducer, initialHeistState);

  useEffect(() => {
    if (!url) return;
    dispatch({ type: "reset" });
    const source = new EventSource(url);
    const send = (item: StreamItem) => dispatch({ type: "item", item });

    source.onmessage = (m) => {
      try {
        send({ kind: "event", event: JSON.parse(m.data) });
      } catch {
        // A malformed line shouldn't take the cockpit down.
      }
    };
    source.addEventListener("run.status", (m) => {
      const { status, message } = JSON.parse((m as MessageEvent).data) as { status: RunStatus; message?: string };
      send({ kind: "status", status, message });
      if (status === "finished" || status === "failed") source.close();
    });
    source.addEventListener("run.summary", (m) => {
      send({ kind: "summary", score: JSON.parse((m as MessageEvent).data) as RunScore });
    });
    // Replays end with this event; without closing, EventSource would reconnect and replay again.
    source.addEventListener("replay.finished", () => {
      send({ kind: "status", status: "finished" });
      source.close();
    });
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) send({ kind: "status", status: "failed", message: "Stream closed" });
    };

    return () => source.close();
  }, [url]);

  return state;
}
