// Results belong to the room, independently of WebGL, camera or chosen view.
export function resultCue(s) {
  const f = s.feedback;
  if (!f || !s.active) return null;
  const own = !!s.me.playerId && f.playerId === s.me.playerId;
  const sameSide = !!s.me.entity && f.entity === s.me.entity;
  const player = s.players.find((p) => p.id === f.playerId)?.name || "Player";
  return {
    id: f.id,
    clueId: s.active.id,
    kind: f.kind,
    title: f.kind === "correct" ? "CORRECT" : "INCORRECT",
    kicker: own
      ? "YOUR ANSWER"
      : sameSide
        ? "YOUR TEAM’S ANSWER"
        : f.kind === "correct"
          ? "ANSWER CONFIRMED"
          : "ANSWER REJECTED",
    who: own ? "You answered" : player,
    delta: f.delta,
    choice: s.active.options?.find((o) => o.id === f.optionId)?.text,
    held: f.kind === "wrong" && sameSide,
    note:
      f.kind === "correct"
        ? "Points banked. Get ready for the next question."
        : s.phase === "revealed"
          ? "Clue closed. See the correct answer on the board."
          : sameSide
            ? "Your side is out for this clue. The other players can rebound."
            : "Other sides · prepare to rebound.",
  };
}

export function keepPersonalResult(moment, s) {
  return (
    !!moment?.held && moment.clueId === s.active?.id && s.phase !== "complete"
  );
}
