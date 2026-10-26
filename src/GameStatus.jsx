import React, { useEffect, useRef, useState } from "react";
import { money, tone, speak } from "./client";
export const sideIds = (s) =>
  s.settings.mode === "teams"
    ? ["a", "b", "c"].slice(0, s.settings.teamCount || 2)
    : s.players.map((p) => p.id);
export const sideName = (s, e) =>
  s.settings.mode === "teams"
    ? s.teams[e]
    : s.players.find((p) => p.id === e)?.name || "Player";
export function useShowTime(s) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  return now + (s.clockOffset || 0);
}
export function showStatus(s, now) {
  const a = s.active,
    who =
      s.players.find((p) => p.id === a?.winner)?.name || sideName(s, a?.owner),
    own = a?.winner === s.me.playerId;
  if (s.paused)
    return {
      title: "The show is paused",
      detail: "Take a breath. Your points and place are saved.",
      kind: "wait",
    };
  if (
    ["arming", "buzzOpen", "answering", "revealed"].includes(s.phase) &&
    s.me.entity &&
    a?.locked.includes(s.me.entity)
  )
    return {
      title: "Your side’s answer was incorrect",
      detail:
        s.phase === "revealed"
          ? "Clue closed. The correct answer is shown below."
          : "You’re locked out for this clue. Watch the other players rebound.",
      kind: "wrong",
    };
  if (s.phase === "arming") {
    const waiting = (a.expectedPlayers || [])
      .filter((id) => !a.readyPlayers.includes(id))
      .map((id) => s.players.find((p) => p.id === id)?.name)
      .filter(Boolean);
    return {
      title: "Checking everyone’s signal",
      detail: waiting.length
        ? "Waiting for " + waiting.join(", ")
        : "Every connected player is ready.",
      kind: "wait",
    };
  }
  if (s.phase === "buzzOpen") {
    const n = Math.max(0, Math.ceil((a.opensAt - now) / 1000));
    if (n)
      return {
        title: `Ready… ${n}`,
        detail: "Buzzers open together at GO. Early taps do not count.",
        kind: "count",
        count: n,
      };
    return {
      title: "GO · Buzzers are open",
      detail: a.locked.includes(s.me.entity)
        ? "Your side has already tried. Watch the other players."
        : "Know the answer? Hit your buzzer.",
      kind: "go",
      count: 0,
    };
  }
  if (["answering", "dailyAnswer"].includes(s.phase))
    return {
      title:
        s.phase === "dailyAnswer"
          ? own
            ? "Your Daily Double. Pick your answer."
            : `${who} is answering the Daily Double`
          : own
            ? "You buzzed first. Pick your answer."
            : `${who} buzzed first`,
      detail: own
        ? "Tap one card. The server checks it automatically."
        : s.me.entity === s.players.find((p) => p.id === a.winner)?.entity
          ? "Your teammate has the floor."
          : "Keep thinking. If they miss, your side can rebound.",
      kind: "answer",
    };
  if (s.phase === "clueReading")
    return {
      title: a?.owner
        ? "Daily Double · read the clue"
        : "Read the question · buzzers locked",
      detail:
        s.me.role === "host"
          ? "When everyone is ready, give the signal below."
          : "Your host will give the signal after everyone has read it.",
      kind: "wait",
    };
  if (s.phase === "revealed")
    return {
      title: "Answer revealed",
      detail:
        s.me.role === "host"
          ? "Take everyone back to the board when ready."
          : "The host will take you back to the board.",
      kind: "reveal",
    };
  if (s.phase === "board")
    return {
      title:
        s.me.playerId === s.selectorId
          ? "Your pick. Choose a question."
          : `${s.players.find((p) => p.id === s.selectorId)?.name || "Player"} chooses the next question`,
      detail:
        s.me.role === "host"
          ? "Last correct player picks. Host controls can pass board control."
          : "Everyone gets a chance to buzz after the signal.",
      kind: "wait",
    };
  if (s.phase === "dailyWager")
    return {
      title: `Daily Double · ${sideName(s, a.owner)}`,
      detail: `${s.players.find((p) => p.id === a.ownerPlayerId)?.name || "The selecting player"} wagers and answers for their side.`,
      kind: "wait",
    };
  if (s.phase === "finalWagers")
    return {
      title: "Final round · private wagers",
      detail: "Each eligible side’s first-listed player submits its wager.",
      kind: "wait",
    };
  if (s.phase === "finalAnswer")
    return {
      title: "Final answers · keep it private",
      detail: s.final.entries[s.me.entity]?.submitted
        ? "Your answer is locked. Wait for the reveal."
        : "Only your side can see its submitted choice.",
      kind: "answer",
    };
  if (s.phase === "finalReview")
    return {
      title: "Final answers are locked",
      detail: "The host is checking the results. The winner reveal is next.",
      kind: "wait",
    };
  return {
    title: "What a night!",
    detail: "The points are temporary. The bragging rights are forever.",
    kind: "reveal",
  };
}
export function TurnSignal({ s, status }) {
  const now = useShowTime(s),
    info = showStatus(s, now),
    last = useRef("");
  useEffect(() => {
    if (s.phase !== "buzzOpen" || s.paused) return;
    const key = s.active.window + ":" + info.count;
    if (key !== last.current) {
      last.current = key;
      tone(info.count ? "count" : "open");
      if (info.count === 0) speak("Buzzers open!");
    }
  }, [s.active?.window, s.phase, s.paused, info.count]);
  const seconds = s.deadline
    ? Math.max(0, Math.ceil((s.deadline - now) / 1000))
    : null;
  const feedback = s.feedback,
    a = s.active,
    option =
      feedback?.optionId && a?.options?.find((o) => o.id === feedback.optionId),
    player =
      s.players.find((p) => p.id === feedback?.playerId)?.name ||
      sideName(s, feedback?.entity);
  return (
    <div className="studio-signals">
      <div
        className={`turn-signal signal-${info.kind}`}
        role="status"
        aria-live="polite"
      >
        <span className="signal-mark">
          {info.kind === "count"
            ? info.count
            : info.kind === "go"
              ? "GO"
              : info.kind === "answer"
                ? "●"
                : "✦"}
        </span>
        <div>
          <strong>
            {status === "live" ? info.title : "Reconnecting · controls locked"}
          </strong>
          <p>{info.detail}</p>
        </div>
        {seconds !== null && info.kind !== "count" && (
          <span className="signal-time">{s.paused ? "Ⅱ" : seconds + "s"}</span>
        )}
      </div>
      {feedback && (
        <div
          key={feedback.id}
          className={"result-signal result-" + feedback.kind}
          role="status"
        >
          <b>{feedback.kind === "correct" ? "✓ CORRECT" : "✕ INCORRECT"}</b>
          <span>
            {player}
            {option
              ? " chose " +
                String.fromCharCode(
                  65 + a.options.findIndex((o) => o.id === option.id),
                ) +
                " · " +
                option.text
              : ""}
          </span>
          <strong>
            {feedback.delta > 0 ? "+" : ""}
            {money(feedback.delta)}
          </strong>
        </div>
      )}
      {s.network?.latency > 500 && (
        <p className="network-warning">
          Your connection is slow ({Math.round(s.network.latency)} ms round
          trip). Countdown is synchronized; buzz travel time can still affect
          the winner.
        </p>
      )}
    </div>
  );
}
