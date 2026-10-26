import { useCallback, useEffect, useRef, useState } from "react";
import { unlockAudio, tone, soundtrack, speak } from "./audio";
import { ClockSync } from "./clock-sync";
export const API = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export const money = (n) =>
  `${n < 0 ? "−" : ""}$${Math.abs(n || 0).toLocaleString("en-US")}`;
export function saved(code, display = false) {
  try {
    return JSON.parse(
      localStorage.getItem(`afterhours:${display ? "display:" : ""}${code}`),
    );
  } catch {
    return null;
  }
}
export function saveSession(s, display = false) {
  localStorage.setItem(
    `afterhours:${display ? "display:" : ""}${s.code}`,
    JSON.stringify(s),
  );
  if (!display) localStorage.setItem("afterhours:last", s.code);
}
export async function api(path, data, auth) {
  const res = await fetch(`${API}${path}`, {
    method: data ? "POST" : "GET",
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Connection failed. Try again.");
  return body;
}
export {
  unlockAudio,
  tone,
  soundtrack,
  speak,
  syncAudio,
  audioSettings,
} from "./audio";
export function useRoom(session) {
  const [state, setState] = useState(null),
    [status, setStatus] = useState("connecting"),
    [network, setNetwork] = useState({
      offset: 0,
      latency: null,
      synced: false,
    }),
    [error, setError] = useState(""),
    socket = useRef(),
    pending = useRef(new Map()),
    latest = useRef(),
    previous = useRef();
  useEffect(() => {
    if (!session) return;
    let closed = false,
      fatal = false,
      retry,
      attempts = 0,
      heartbeat,
      lastMessage = Date.now(),
      clock = new ClockSync(),
      clockTimers = [],
      readyWindow = null;
    function connect() {
      clock.samples = [];
      readyWindow = null;
      if (closed) return;
      setStatus("connecting");
      const root = new URL(API || window.location.origin);
      root.protocol = root.protocol === "https:" ? "wss:" : "ws:";
      root.pathname = "/ws";
      root.search = `?code=${session.code}`;
      const ws = new WebSocket(root);
      socket.current = ws;
      ws.onopen = () => {
        lastMessage = Date.now();
        ws.send(
          JSON.stringify({
            type: "auth",
            code: session.code,
            token: session.token,
          }),
        );
        const sync = () => {
          if (ws.readyState === 1)
            ws.send(JSON.stringify({ type: "clock", sentAt: Date.now() }));
        };
        [0, 150, 350, 700].forEach((ms) =>
          clockTimers.push(setTimeout(sync, ms)),
        );
        heartbeat = setInterval(() => {
          sync();
          if (Date.now() - lastMessage > 45000) {
            ws.close();
            return;
          }
          if (ws.readyState === 1) ws.send("ping");
        }, 20000);
      };
      ws.onmessage = ({ data }) => {
        lastMessage = Date.now();
        if (data === "pong") return;
        let m;
        try {
          m = JSON.parse(data);
        } catch {
          return;
        }
        const ready = () => {
          const next = latest.current;
          if (
            next?.phase === "arming" &&
            !next.paused &&
            next.me.playerId &&
            clock.ready &&
            !document.hidden &&
            readyWindow !== next.active.window
          ) {
            readyWindow = next.active.window;
            ws.send(
              JSON.stringify({
                id: crypto.randomUUID(),
                type: "readyBuzz",
                payload: { window: readyWindow },
              }),
            );
          }
        };
        if (m.type === "clock") {
          if (clock.add(m.sentAt, Date.now(), m.serverNow)) {
            setNetwork({
              offset: clock.offset,
              latency: clock.latency,
              synced: clock.ready,
            });
            ready();
          }
          return;
        }
        if (m.type === "state") {
          attempts = 0;
          const next = m.state,
            prev = previous.current;
          next.clockOffset = clock.best
            ? clock.offset
            : next.serverNow - Date.now();
          latest.current = next;
          soundtrack(next.phase, next.paused);
          if (prev && prev.revision !== next.revision) {
            if (next.feedback?.id && next.feedback.id !== prev.feedback?.id) {
              tone(next.feedback.kind);
              const name =
                next.players.find((p) => p.id === next.feedback.playerId)
                  ?.name || "That answer";
              speak(
                next.feedback.kind === "correct"
                  ? `Answer verified. ${name}, points secured.`
                  : `${name}, answer rejected. Other sides, stand by.`,
              );
            } else if (
              next.phase === "answering" &&
              prev.phase !== "answering"
            ) {
              tone("buzz");
              const name =
                next.players.find((p) => p.id === next.active.winner)?.name ||
                "Player";
              speak(`${name}, signal locked. Choose your answer.`);
              if (next.active.winner === next.me.playerId)
                navigator.vibrate?.(80);
            } else if (next.active?.id && next.active.id !== prev.active?.id) {
              tone(next.active.owner ? "double" : "reveal");
              speak(
                next.active.owner
                  ? "Daily Double. Power surge. Set your wager."
                  : "New question. Signal incoming.",
              );
            } else if (next.phase === "complete") {
              tone("final");
              speak("Session complete. Victory secured.");
            }
          }
          previous.current = next;
          setState(next);
          setStatus("live");
          ready();
        }
        if (m.type === "fatal") {
          fatal = true;
          setStatus("expired");
          setError(m.error);
        }
        if (m.type === "error") {
          setError(m.error);
          const p = pending.current.get(m.id);
          if (p) {
            clearTimeout(p.timer);
            p.reject(new Error(m.error));
            pending.current.delete(m.id);
          }
        }
        if (m.type === "ack") {
          const p = pending.current.get(m.id);
          if (p) {
            clearTimeout(p.timer);
            p.resolve();
            pending.current.delete(m.id);
          }
        }
      };
      ws.onclose = () => {
        clearInterval(heartbeat);
        for (const p of pending.current.values()) {
          clearTimeout(p.timer);
          p.reject(
            new Error(
              "Disconnected. Review the latest state before trying again.",
            ),
          );
        }
        pending.current.clear();
        if (!closed && !fatal) {
          setStatus("reconnecting");
          retry = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 10000));
        }
      };
      ws.onerror = () => ws.close();
    }
    const reconnect = () => {
      if (socket.current?.readyState !== 1) {
        clearTimeout(retry);
        connect();
      }
    };
    const resync = () => {
      if (!document.hidden && socket.current?.readyState === 1)
        socket.current.send(
          JSON.stringify({ type: "clock", sentAt: Date.now() }),
        );
    };
    connect();
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", resync);
    window.addEventListener("online", reconnect);
    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(heartbeat);
      window.removeEventListener("online", reconnect);
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", resync);
      clockTimers.forEach(clearTimeout);
      soundtrack("lobby", true);
      socket.current?.close();
    };
  }, [session?.code, session?.token]);
  const send = useCallback((type, payload = {}) => {
    unlockAudio();
    const ws = socket.current;
    if (ws?.readyState !== 1 || !latest.current) {
      setError("Reconnecting to the studio. Try again when connected.");
      return Promise.resolve(false);
    }
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.current.delete(id);
        setError(
          "No acknowledgement yet. Reconnecting to confirm the game state.",
        );
        ws.close();
        reject(new Error("Action timed out."));
      }, 6000);
      pending.current.set(id, { resolve, reject, timer });
      ws.send(
        JSON.stringify({
          id,
          type,
          payload,
          revision: latest.current.revision,
        }),
      );
    })
      .then(() => true)
      .catch(() => false);
  }, []);
  return {
    state: state
      ? {
          ...state,
          clockOffset: network.synced ? network.offset : state.clockOffset,
          network,
        }
      : null,
    status,
    error,
    setError,
    send,
  };
}
