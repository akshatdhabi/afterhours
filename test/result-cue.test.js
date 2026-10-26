import { test } from "node:test";
import assert from "node:assert/strict";
import { resultCue, keepPersonalResult } from "../src/result-cue.js";
const state = (me) => ({
  phase: "arming",
  me,
  players: [
    { id: "ada", name: "Ada" },
    { id: "bo", name: "Bo" },
  ],
  active: {
    id: "clue1",
    winner: null,
    options: [{ id: "c0", text: "Mars" }],
    locked: ["teamA"],
  },
  feedback: {
    id: "result1",
    playerId: "ada",
    entity: "teamA",
    optionId: "c0",
    kind: "wrong",
    delta: -400,
  },
});
test("wrong actor and teammate receive a held personal verdict even after winner is reset for rebound", () => {
  const actor = resultCue(state({ playerId: "ada", entity: "teamA" }));
  assert.equal(actor.held, true);
  assert.equal(actor.kicker, "YOUR ANSWER");
  assert.equal(actor.choice, "Mars");
  assert.equal(actor.delta, -400);
  const mate = resultCue(state({ playerId: "bo", entity: "teamA" }));
  assert.equal(mate.held, true);
  assert.equal(mate.kicker, "YOUR TEAM’S ANSWER");
  assert.equal(
    resultCue(state({ playerId: "bo", entity: "teamB" })).held,
    false,
  );
  assert.equal(resultCue(state({ role: "spectator" })).held, false);
});
test("personal verdict survives later rebound feedback and remount snapshots, but clears on the next clue", () => {
  const s = state({ playerId: "ada", entity: "teamA" }),
    moment = resultCue(s);
  assert.deepEqual(resultCue(structuredClone(s)), moment);
  const rebound = structuredClone(s);
  rebound.feedback = {
    ...s.feedback,
    id: "result2",
    playerId: "bo",
    entity: "teamB",
  };
  assert.equal(keepPersonalResult(moment, rebound), true);
  rebound.active.id = "clue2";
  assert.equal(keepPersonalResult(moment, rebound), false);
  assert.equal(
    keepPersonalResult(moment, { ...s, active: null, phase: "board" }),
    false,
  );
  assert.equal(keepPersonalResult(moment, { ...s, phase: "complete" }), false);
});
