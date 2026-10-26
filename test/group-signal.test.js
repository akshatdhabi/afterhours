import { createTestRoom as createRoom } from "./fixtures.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  joinRoom,
  sessionFor,
  act,
  view,
  tick,
  optionsFor,
} from "../server/game.js";
import { ClockSync } from "../src/clock-sync.js";
function group(count, teams = 0) {
  const { room: r } = createRoom("ABC234", {
    name: "Phone host",
    mode: teams ? "teams" : "individual",
    playerCount: count,
    teamCount: teams || 2,
    hostPlays: true,
    packSource: "starter",
  });
  for (let i = 1; i < count; i++)
    joinRoom(r, { name: "Friend " + i, role: "player" });
  const host = r.sessions[0],
    ps = r.sessions.filter((s) => s.playerId),
    connected = new Set(ps.map((s) => s.id));
  let now = Date.now();
  const cmd = (type, payload = {}, s = host, t = now) => {
    now = t;
    return act(
      r,
      s,
      { id: randomUUID(), revision: r.revision, type, payload },
      t,
      connected,
    );
  };
  return {
    r,
    host,
    ps,
    connected,
    cmd,
    get now() {
      return now;
    },
  };
}
test("a phone host occupies one of 2–6 seats; individuals and 2/3 balanced teams start", () => {
  for (let n = 2; n <= 6; n++)
    for (const teams of [0, 2, 3].filter((t) => t <= n)) {
      const x = group(n, teams);
      assert.equal(x.r.players.length, n);
      assert.equal(x.r.sessions[0].playerId, x.r.players[0].id);
      assert.throws(
        () => joinRoom(x.r, { name: "Extra", role: "player" }),
        /seats/,
      );
      x.cmd("start");
      assert.equal(x.r.phase, "board");
      assert.equal(
        new Set(x.r.players.map((p) => (teams ? p.team : p.id))).size,
        teams || n,
      );
    }
});
test("counts outside 2–6 and a fourth team are rejected; seat reduction and imbalance are guarded", () => {
  for (const count of [1, 7, 2.5])
    assert.throws(() =>
      createRoom("ABC234", {
        name: "Host",
        mode: "individual",
        playerCount: count,
      }),
    );
  assert.throws(() =>
    createRoom("ABC234", { name: "Host", mode: "teams", teamCount: 4 }),
  );
  const x = group(6, 3);
  assert.throws(() => x.cmd("configure", { playerCount: 2 }), /Release/);
  x.cmd("team", { playerId: x.r.players[1].id, team: "a" });
  assert.throws(() => x.cmd("start"), /balanced/);
});
test("no buzzer opens until every connected eligible player acknowledges, then one future timestamp is shared", () => {
  const x = group(6, 3);
  x.cmd("start");
  x.cmd("select", { clueId: "r0c0q0" });
  x.cmd("openBuzz");
  const window = x.r.active.window;
  assert.equal(x.r.phase, "arming");
  for (const p of x.ps.slice(0, 5))
    x.cmd("readyBuzz", { window }, p, x.now + 120);
  assert.equal(x.r.phase, "arming");
  assert.equal(x.r.active.opensAt, null);
  assert.throws(() => x.cmd("buzz", { window }, x.ps[0]), /closed/);
  x.cmd("readyBuzz", { window }, x.ps[5], x.now + 1900);
  const opens = x.r.active.opensAt;
  assert.equal(x.r.phase, "buzzOpen");
  assert.equal(opens, x.now + 3000);
  assert.ok(x.ps.every((p) => view(x.r, p).active.opensAt === opens));
  assert.throws(
    () =>
      x.cmd(
        "buzz",
        { window, timestamp: opens, score: 999 },
        x.ps[0],
        opens - 1,
      ),
    /closed/,
  );
  x.cmd("buzz", { window }, x.ps[4], opens);
  assert.equal(x.r.active.winner, x.ps[4].playerId);
  assert.throws(() => x.cmd("buzz", { window }, x.ps[0], opens), /closed/);
});
test("missing readiness times out without opening; retry changes nonce and excludes offline sessions", () => {
  const x = group(2);
  x.cmd("start");
  x.cmd("select", { clueId: "r0c0q0" });
  x.cmd("openBuzz");
  const old = x.r.active.window;
  tick(x.r, x.r.deadline, x.connected);
  assert.equal(x.r.phase, "clueReading");
  x.connected.delete(x.ps[1].id);
  x.cmd("openBuzz");
  assert.notEqual(old, x.r.active.window);
  assert.deepEqual(x.r.active.expectedPlayers, [x.ps[0].playerId]);
  assert.throws(() => x.cmd("readyBuzz", { window: old }, x.ps[0]), /closed/);
});
test("wrong answer publishes an explicit result without revealing the key; rebound has a new readiness barrier", () => {
  const x = group(6, 3);
  x.cmd("start");
  x.cmd("select", { clueId: "r0c0q0" });
  x.cmd("openBuzz");
  for (const p of x.ps) x.cmd("readyBuzz", { window: x.r.active.window }, p);
  x.cmd("buzz", { window: x.r.active.window }, x.ps[0], x.r.active.opensAt);
  const q = x.r.pack.rounds[0].categories[0].clues[0],
    wrong = optionsFor(q).find((o) => o.text !== q.answer);
  x.cmd("answer", { window: x.r.active.window, optionId: wrong.id }, x.ps[0]);
  const other = view(x.r, x.ps[1]);
  assert.equal(other.feedback.kind, "wrong");
  assert.equal(other.feedback.optionId, wrong.id);
  assert.equal(other.feedback.delta, -200);
  assert.equal(other.feedback.playerId, x.ps[0].playerId);
  assert.equal(other.active.answer, undefined);
  assert.equal(x.r.phase, "arming");
  assert.equal(x.r.active.expectedPlayers.length, 4);
  assert.ok(!x.r.active.expectedPlayers.includes(x.ps[3].playerId));
  assert.ok(other.active.missedOptions.includes(wrong.id));
});
test("midpoint clock sync removes static clock skew and selects the least queued round trip", () => {
  const c = new ClockSync();
  c.add(1000, 1040, 1520);
  c.add(2000, 2600, 2600);
  assert.equal(c.offset, 500);
  assert.equal(c.latency, 600);
  assert.equal(c.ready, true);
  // Different delivery delays with the same midpoint offset render GO at the same server timestamp.
  const b = new ClockSync();
  b.add(1000, 1200, 1600);
  b.add(2000, 2200, 2600);
  assert.equal(b.offset, c.offset);
  assert.equal(10000 - c.offset, 10000 - b.offset);
  assert.equal(c.add(500, 400, 500), false);
});
