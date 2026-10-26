import { createTestRoom as createRoom } from "./fixtures.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { joinRoom, sessionFor, act, view, optionsFor } from "../server/game.js";
import { packSchema } from "../server/schema.js";
function setup() {
  const { room: r } = createRoom("ABC234", {
      name: "Host",
      mode: "teams",
      packSource: "starter",
    }),
    host = r.sessions[0],
    ps = [];
  for (const name of ["One", "Two", "Three", "Four"])
    ps.push(sessionFor(r, joinRoom(r, { name, role: "player" }).token));
  const cmd = (type, payload = {}, s = host) =>
    act(
      r,
      s,
      { id: randomUUID(), type, payload, revision: r.revision },
      Math.max(Date.now(), r.active?.opensAt || 0),
      new Set(),
    );
  return { r, host, ps, cmd };
}
test("only a winning buzzer can select; the server grades the option and ignores claimed correctness", () => {
  const x = setup();
  x.cmd("start");
  x.cmd("select", { clueId: "r0c0q0" });
  x.cmd("openBuzz");
  const window = x.r.active.window;
  x.cmd("buzz", { window }, x.ps[0]);
  const q = x.r.pack.rounds[0].categories[0].clues[0],
    options = optionsFor(q),
    correct = options.find((o) => o.text === q.answer),
    wrong = options.find((o) => o.text !== q.answer);
  assert.throws(
    () => x.cmd("answer", { window, optionId: correct.id }, x.ps[1]),
    /winning/,
  );
  assert.throws(
    () => x.cmd("answer", { window, optionId: "forged" }, x.ps[0]),
    /four/,
  );
  x.cmd(
    "answer",
    { window, optionId: wrong.id, correct: true, score: 99999 },
    x.ps[0],
  );
  assert.equal(x.r.scores.a, -200);
  assert.equal(x.r.phase, "buzzOpen");
  const rebound = x.r.active.window;
  x.cmd("buzz", { window: rebound }, x.ps[1]);
  x.cmd(
    "answer",
    { window: rebound, optionId: correct.id, correct: false },
    x.ps[1],
  );
  assert.equal(x.r.scores.b, 200);
  assert.equal(x.r.phase, "revealed");
  assert.throws(() =>
    x.cmd("answer", { window: rebound, optionId: correct.id }, x.ps[1]),
  );
  assert.equal(x.r.scores.b, 200);
});
test("correct choices are private before reveal; Daily Double choices wait for the wager", () => {
  const x = setup();
  x.cmd("start");
  x.cmd("select", { clueId: "r0c2q2" });
  assert.deepEqual(view(x.r, x.ps[1]).active.options, []);
  x.cmd("dailyWager", { window: x.r.active.window, amount: 600 }, x.ps[0]);
  let v = view(x.r, x.ps[1]);
  assert.equal(v.active.options.length, 4);
  assert.equal(v.active.correctOptionId, undefined);
  assert.equal(v.active.answer, undefined);
  x.cmd("dailyOpen");
  const q = x.r.pack.rounds[0].categories[2].clues[2];
  const option = optionsFor(q).find((o) => o.text === q.answer);
  x.cmd("answer", { window: x.r.active.window, optionId: option.id }, x.ps[0]);
  assert.equal(x.r.scores.a, 600);
  assert.equal(view(x.r, x.ps[1]).active.correctOptionId, option.id);
});
test("final multiple-choice submissions remain private and auto-grade only when locked", () => {
  const x = setup();
  x.cmd("start");
  for (const e of ["a", "b"])
    x.cmd("adjust", { entity: e, delta: 1000, reason: "Final test" });
  x.cmd("finalBegin", { skip: true });
  const window = x.r.final.window;
  x.cmd("finalWager", { window, amount: 400 }, x.ps[0]);
  x.cmd("finalWager", { window, amount: 500 }, x.ps[1]);
  x.cmd("finalOpen");
  const opts = optionsFor(x.r.pack.final),
    right = opts.find((o) => o.text === x.r.pack.final.answer),
    wrong = opts.find((o) => o.text !== x.r.pack.final.answer);
  x.cmd("finalAnswer", { window, optionId: right.id }, x.ps[0]);
  x.cmd("finalAnswer", { window, optionId: wrong.id }, x.ps[1]);
  assert.equal(view(x.r, x.host).final.entries.a.answer, undefined);
  assert.equal(view(x.r, x.ps[1]).final.entries.a.answer, undefined);
  assert.deepEqual(x.r.final.results, {});
  x.cmd("finalLock");
  assert.deepEqual(x.r.final.results, { a: true, b: false });
  assert.equal(view(x.r, x.ps[0]).final.results, undefined);
  x.cmd("finish");
  assert.deepEqual(x.r.scores, { a: 1400, b: 500 });
});
