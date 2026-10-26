import test from "node:test";
import assert from "node:assert/strict";
import { cueScore, musicProfile, scoreStep, hz } from "../src/sound-design.js";
const phases = [
  "lobby",
  "board",
  "clueReading",
  "arming",
  "buzzOpen",
  "answering",
  "dailyWager",
  "dailyAnswer",
  "finalWagers",
  "finalAnswer",
  "complete",
];
test("every original cue has finite pitches, bounded gains and a distinct score", () => {
  const signatures = new Set();
  for (const kind of [
    "count",
    "open",
    "buzz",
    "correct",
    "wrong",
    "double",
    "final",
    "reveal",
    "comms",
  ]) {
    const score = cueScore(kind);
    assert.ok(score.length > 0);
    for (const e of score) {
      assert.ok(Number.isFinite(hz(e.midi)));
      assert.ok(e.level > 0 && e.level <= 0.2);
      assert.ok(e.duration > 0 && e.duration < 3);
      assert.ok(e.offset >= 0 && e.offset < 3);
    }
    signatures.add(JSON.stringify(score));
  }
  assert.equal(signatures.size, 9);
});
test("all score phases schedule a bounded four-bar loop and duck during answers", () => {
  for (const phase of phases) {
    for (let i = 0; i < 64; i++) {
      const plan = scoreStep(i, phase);
      assert.ok(plan.seconds >= 0.1 && plan.seconds <= 0.2);
      assert.ok(plan.events.length <= 6);
      for (const e of plan.events) {
        assert.ok(hz(e.midi) > 20 && hz(e.midi) < 12000);
        assert.ok(e.level <= 0.2);
        assert.ok(e.duration > 0);
      }
    }
    assert.deepEqual(scoreStep(0, phase), scoreStep(64, phase));
  }
  assert.ok(musicProfile("answering").mix < musicProfile("board").mix);
  assert.ok(musicProfile("clueReading").mix < musicProfile("board").mix);
  assert.ok(musicProfile("buzzOpen").bpm > musicProfile("clueReading").bpm);
});
