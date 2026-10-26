import React, { useEffect, useRef, useState } from "react";
import { money } from "./client";
import { sideIds, sideName } from "./GameStatus";
import { resultCue, keepPersonalResult } from "./result-cue.js";
import { CircuitFrame } from "./CircuitFrame";
export default function ShowMoment({ s, reduced }) {
  const [moment, setMoment] = useState(null),
    seen = useRef(null),
    dismissButton = useRef(),
    ackKey = "afterhours:result:" + s.code + ":" + s.me.playerId,
    acknowledged = useRef(
      (() => {
        try {
          return sessionStorage.getItem(ackKey);
        } catch {
          return null;
        }
      })(),
    ),
    phase = useRef(s.phase),
    timer = useRef();
  useEffect(() => {
    let next = null;
    if (s.feedback?.id && seen.current !== s.feedback.id) {
      seen.current = s.feedback.id;
      if (s.feedback.id !== acknowledged.current) {
        next = resultCue(s);
        if (next) next.score = (next.delta > 0 ? "+" : "") + money(next.delta);
      }
    }
    if (s.phase === "dailyWager" && phase.current !== "dailyWager")
      next = {
        id: "double:" + s.active.id,
        kind: "double",
        title: "DAILY DOUBLE",
        kicker: "A CHANGE IN THE STAKES",
        who: sideName(s, s.active.owner),
        note: "One side. One wager. Your moment.",
      };
    if (s.phase === "complete" && phase.current !== "complete") {
      const ids = sideIds(s),
        max = Math.max(...ids.map((e) => s.scores[e])),
        wins = ids.filter((e) => s.scores[e] === max);
      next = {
        id: "victory:" + s.revision,
        kind: "victory",
        title: wins.length > 1 ? "SHARED VICTORY" : "VICTORY",
        kicker: "THAT’S A WRAP",
        who: wins.map((e) => sideName(s, e)).join(" & "),
        score: money(max),
        note: "A night for the group chat.",
      };
    }
    phase.current = s.phase;
    if (next) {
      clearTimeout(timer.current);
      setMoment((current) =>
        keepPersonalResult(current, s) && next.kind !== "victory"
          ? current
          : next,
      );
      if (!next.held)
        timer.current = setTimeout(
          () => setMoment((current) => (current?.held ? current : null)),
          next.kind === "victory" ? 3800 : next.kind === "double" ? 1800 : 1600,
        );
    } else {
      setMoment((current) =>
        current?.clueId && current.clueId !== s.active?.id
          ? null
          : current?.held && s.phase === "revealed"
            ? {
                ...current,
                note: "Clue closed. See the correct answer on the board.",
              }
            : current,
      );
    }
  }, [s.feedback?.id, s.phase, s.revision, s.active?.id]);
  useEffect(() => () => clearTimeout(timer.current), []);
  function dismiss() {
    acknowledged.current = moment.id;
    try {
      sessionStorage.setItem(ackKey, moment.id);
    } catch {
      /* Private browsing may deny storage. */
    }
    setMoment(null);
  }
  useEffect(() => {
    if (!moment?.held) return;
    const previous = document.activeElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dismissButton.current?.focus({ preventScroll: true });
    const key = (e) => {
      if (e.key === "Escape") dismissButton.current?.click();
      if (e.key === "Tab") {
        e.preventDefault();
        dismissButton.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus?.({ preventScroll: true });
      else
        document.getElementById("main-content")?.focus({ preventScroll: true });
    };
  }, [moment?.held]);
  if (!moment) return null;
  return (
    <div
      className={
        "show-moment room-moment moment-" +
        moment.kind +
        (reduced ? " moment-still" : "") +
        (moment.held ? " moment-held" : "")
      }
      key={moment.id}
      role={moment.held ? "dialog" : "status"}
      aria-modal={moment.held || undefined}
      aria-labelledby="moment-title"
      aria-live="assertive"
    >
      <div className="moment-scan" />
      <div className="moment-frame">
        <CircuitFrame />
        <span className="moment-index">AFTERHOURS / LIVE</span>
        <span className="moment-kicker">{moment.kicker}</span>
        <div className="moment-rule" />
        <strong id="moment-title" className="moment-title">
          {moment.title}
        </strong>
        <span className="moment-person">{moment.who}</span>
        {moment.choice && <p className="moment-choice">“{moment.choice}”</p>}
        {moment.score && <b className="moment-score">{moment.score}</b>}
        <div className="moment-rule" />
        <span className="moment-note">{moment.note}</span>
        {moment.held && (
          <button
            ref={dismissButton}
            className="moment-dismiss"
            onClick={dismiss}
          >
            Back to the game <span aria-hidden="true">↗</span>
          </button>
        )}
        <span className="moment-glyph" aria-hidden="true">
          {moment.kind === "wrong"
            ? "×"
            : moment.kind === "double"
              ? "Ⅱ"
              : moment.kind === "correct"
                ? "✓"
                : "✦"}
        </span>
      </div>
      {moment.kind === "victory" && (
        <div className="moment-confetti" aria-hidden="true">
          {Array.from({ length: 24 }, (_, i) => (
            <i
              key={i}
              style={{
                "--i": i,
                "--x": ((i * 37) % 100) + "%",
                "--delay": (i % 6) * 0.09 + "s",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
