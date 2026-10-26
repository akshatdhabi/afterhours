import { createTestRoom as createRoom } from "./fixtures.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  joinRoom,
  act,
  view,
  tick,
  entities,
  sessionFor,
} from "../server/game.js";
import { testPack as starterPack } from "./fixtures.js";
import { packSchema } from "../server/schema.js";
const now = Date.now() + 1000;
function setup(mode = "individual", extra = {}) {
  const { room: r, token } = createRoom(
    "ABC234",
    { name: "Host", mode, packSource: "starter", ...extra },
    now,
  );
  const host = r.sessions[0],
    players = [];
  for (const name of ["Ada", "Bo", "Cam", "Dee"]) {
    const join = joinRoom(r, { name, role: "player" }, now);
    players.push(sessionFor(r, join.token));
  }
  const cmd = (type, payload = {}, s = host, t, id = randomUUID()) =>
    act(
      r,
      s,
      { type, payload, revision: r.revision, id },
      t ?? Math.max(now, r.active?.opensAt || 0),
      new Set(),
    );
  return { r, host, players, cmd, token };
}
function live(x, id = "r0c0q0") {
  x.cmd("start");
  x.cmd("select", { clueId: id });
  x.cmd("openBuzz");
}
function buzz(x, index = 0) {
  x.cmd("buzz", { window: x.r.active.window }, x.players[index]);
}
test("starter pack has 30 unique clues, one daily double, and a final", () => {
  const p = packSchema.parse(starterPack),
    qs = p.rounds.flatMap((r) => r.categories.flatMap((c) => c.clues));
  assert.equal(qs.length, 30);
  assert.equal(new Set(qs.map((q) => q.id)).size, 30);
  assert.equal(qs.filter((q) => q.dailyDouble).length, 1);
});
test("four seats, no duplicate names, late players can only spectate", () => {
  const x = setup();
  assert.throws(
    () => joinRoom(x.r, { name: "Fifth", role: "player" }, now),
    /seats/,
  );
  x.cmd("start");
  assert.throws(
    () => joinRoom(x.r, { name: "Fifth", role: "player" }, now),
    /started/,
  );
  assert.ok(joinRoom(x.r, { name: "Guest", role: "spectator" }, now).token);
});
test("exactly four seats are required and team sizes are validated", () => {
  const x = setup("teams");
  x.cmd("team", { playerId: x.r.players[1].id, team: "a" });
  assert.throws(() => x.cmd("start"), /balanced/);
});
test("first of four simultaneous logical buzzes wins; exactly one answer opens", () => {
  const x = setup();
  live(x);
  const window = x.r.active.window;
  const outcomes = x.players.map((s) => {
    try {
      x.cmd("buzz", { window }, s);
      return true;
    } catch {
      return false;
    }
  });
  assert.deepEqual(outcomes, [true, false, false, false]);
  assert.equal(x.r.active.winner, x.players[0].playerId);
  assert.equal(x.r.phase, "answering");
});
test("clients cannot choose clues, judge, modify scores or forge wagering", () => {
  const x = setup();
  live(x);
  for (const type of ["judge", "adjust", "pause", "nextRound", "finalJudge"])
    assert.throws(
      () => x.cmd(type, { correct: true, delta: 9999 }, x.players[0]),
      /host/,
    );
  assert.throws(() =>
    x.cmd(
      "dailyWager",
      { window: x.r.active.window, amount: 9999 },
      x.players[0],
    ),
  );
  assert.equal(x.r.scores[x.r.players[0].id], 0);
});
test("answer data and hidden doubles never enter player or spectator board payloads", () => {
  const x = setup();
  live(x);
  let v = view(x.r, x.players[0]);
  assert.equal(v.active.answer, undefined);
  assert.equal(v.pack.rounds[0].categories[0].clues[0].dailyDouble, undefined);
  assert.equal(v.pack.rounds[0].categories[1].clues[0].question, undefined);
  assert.equal(
    view(x.r, x.host).active.answer,
    starterPack.rounds[0].categories[0].clues[0].answer,
  );
  x.cmd("closeClue");
  assert.equal(
    view(x.r, x.players[0]).active.answer,
    starterPack.rounds[0].categories[0].clues[0].answer,
  );
});
test("correct answers award score and next selection to the answering side", () => {
  const x = setup();
  live(x);
  buzz(x, 2);
  x.cmd("judge", { correct: true });
  assert.equal(x.r.scores[x.r.players[2].id], 200);
  assert.equal(x.r.control, x.r.players[2].id);
  assert.equal(x.r.phase, "revealed");
  assert.ok(x.r.used.includes("r0c0q0"));
});
test("wrong answers penalize and lock the entire team; other team can rebound", () => {
  const x = setup("teams");
  live(x);
  buzz(x, 0);
  x.cmd("judge", { correct: false });
  assert.equal(x.r.scores.a, -200);
  assert.equal(x.r.phase, "buzzOpen");
  assert.throws(() => buzz(x, 2), /already answered/);
  buzz(x, 1);
  x.cmd("judge", { correct: true });
  assert.equal(x.r.scores.b, 200);
  assert.equal(x.r.control, "b");
});
test("penalties can be turned off for normal clues", () => {
  const x = setup("individual", { penalties: false });
  live(x);
  buzz(x);
  x.cmd("judge", { correct: false });
  assert.equal(x.r.scores[x.r.players[0].id], 0);
});
test("an old buzzer window cannot win a rebound", () => {
  const x = setup();
  live(x);
  const old = x.r.active.window;
  buzz(x);
  x.cmd("judge", { correct: false });
  assert.throws(() => x.cmd("buzz", { window: old }, x.players[1]), /closed/);
  buzz(x, 1);
  assert.equal(x.r.active.winner, x.players[1].playerId);
});
test("stale host commands are rejected; replayed command IDs are idempotent", () => {
  const x = setup();
  live(x);
  buzz(x);
  const c = {
    id: randomUUID(),
    type: "judge",
    payload: { correct: true },
    revision: x.r.revision,
  };
  assert.equal(act(x.r, x.host, c, now), true);
  assert.equal(act(x.r, x.host, c, now), false);
  assert.equal(x.r.scores[x.r.players[0].id], 200);
  assert.throws(
    () =>
      act(
        x.r,
        x.host,
        {
          id: randomUUID(),
          type: "continue",
          payload: {},
          revision: c.revision,
        },
        now,
      ),
    /changed/,
  );
});
test("server deadline rejects late buzz; read time itself does not count", () => {
  const x = setup();
  x.cmd("start");
  x.cmd("select", { clueId: "r0c0q0" });
  assert.equal(x.r.deadline, null);
  x.cmd("openBuzz");
  assert.throws(
    () =>
      x.cmd("buzz", { window: x.r.active.window }, x.players[0], x.r.deadline),
    /closed/,
  );
  tick(x.r, x.r.deadline, new Set());
  assert.equal(x.r.phase, "revealed");
});
test("answer timeouts are incorrect; all sides locked closes the clue", () => {
  const x = setup("teams");
  live(x);
  buzz(x);
  tick(x.r, x.r.deadline, new Set());
  assert.equal(x.r.scores.a, -200);
  buzz(x, 1);
  tick(x.r, x.r.deadline, new Set());
  assert.equal(x.r.phase, "revealed");
  assert.equal(x.r.scores.b, -200);
});
test("pause preserves timer duration and rejects all other actions", () => {
  const x = setup();
  live(x);
  const deadline = x.r.deadline;
  x.cmd("pause", {}, x.host, now + 1000);
  assert.equal(x.r.remaining, deadline - now - 1000);
  assert.equal(tick(x.r, now + 60000), false);
  assert.throws(() => buzz(x), /paused/);
  x.cmd("pause", {}, x.host, now + 60000);
  assert.equal(x.r.deadline, now + 60000 + (deadline - now - 1000));
});
test("Daily Double clue stays secret until a legal owner wager is locked", () => {
  const x = setup("teams");
  x.cmd("start");
  x.cmd("select", { clueId: "r0c2q2" });
  assert.equal(x.r.phase, "dailyWager");
  assert.equal(view(x.r, x.players[0]).active.question, null);
  assert.throws(
    () =>
      x.cmd(
        "dailyWager",
        { window: x.r.active.window, amount: 100 },
        x.players[1],
      ),
    /selected/,
  );
  assert.throws(
    () =>
      x.cmd(
        "dailyWager",
        { window: x.r.active.window, amount: 1001 },
        x.players[0],
      ),
    /0 to 1000/,
  );
  x.cmd("dailyWager", { window: x.r.active.window, amount: 900 }, x.players[0]);
  assert.ok(view(x.r, x.players[0]).active.question);
  x.cmd("dailyOpen");
  x.cmd("judge", { correct: true });
  assert.equal(x.r.scores.a, 900);
});
test("Daily Doubles always lose the wager on an incorrect answer, even with ordinary penalties off", () => {
  const x = setup("teams", { penalties: false });
  x.cmd("start");
  x.cmd("select", { clueId: "r0c2q2" });
  x.cmd(
    "dailyWager",
    { window: x.r.active.window, amount: 1000 },
    x.players[0],
  );
  x.cmd("dailyOpen");
  x.cmd("judge", { correct: false });
  assert.equal(x.r.scores.a, -1000);
});
function final(x) {
  x.cmd("start");
  for (const e of entities(x.r))
    x.cmd("adjust", { entity: e, delta: 1000, reason: "Test score" });
  x.cmd("finalBegin", { skip: true });
}
test("final wagers and answers are private, immutable and apply exactly once", () => {
  const x = setup("teams");
  final(x);
  const window = x.r.final.window;
  x.cmd("finalWager", { window, amount: 300 }, x.players[0]);
  x.cmd("finalWager", { window, amount: 500 }, x.players[1]);
  assert.equal(view(x.r, x.host).final.entries.a.wager, undefined);
  assert.equal(view(x.r, x.players[1]).final.entries.a.wager, undefined);
  assert.equal(view(x.r, x.players[2]).final.entries.a.wager, 300);
  assert.throws(() =>
    x.cmd("finalWager", { window, amount: 50 }, x.players[0]),
  );
  assert.throws(() =>
    x.cmd("finalWager", { window, amount: 50 }, x.players[2]),
  );
  x.cmd("finalOpen");
  x.cmd(
    "finalAnswer",
    {
      window,
      optionId: "c" + x.r.pack.final.choices.indexOf(x.r.pack.final.answer),
    },
    x.players[0],
  );
  assert.equal(view(x.r, x.host).final.entries.a.answer, undefined);
  assert.equal(view(x.r, x.players[1]).final.entries.a.answer, undefined);
  assert.throws(() =>
    x.cmd("finalAnswer", { window, answer: "Changed" }, x.players[0]),
  );
  x.cmd("finalLock");
  assert.equal(
    view(x.r, x.host).final.entries.a.answer,
    starterPack.final.answer,
  );
  x.cmd("finalJudge", { entity: "a", correct: true });
  x.cmd("finalJudge", { entity: "b", correct: false });
  assert.equal(x.r.scores.a, 1000);
  x.cmd("finish");
  assert.equal(x.r.scores.a, 1300);
  assert.equal(x.r.scores.b, 500);
  assert.equal(
    view(x.r, x.players[1]).final.entries.a.answer,
    starterPack.final.answer,
  );
  assert.throws(() => x.cmd("finish"));
});
test("final caps wagers, excludes nonpositive scores, supports missing-player fallback and times out", () => {
  const x = setup("teams");
  x.cmd("start");
  x.cmd("adjust", { entity: "a", delta: 300, reason: "Test score" });
  x.cmd("finalBegin", { skip: true });
  assert.deepEqual(x.r.final.eligible, ["a"]);
  assert.throws(() =>
    x.cmd(
      "finalWager",
      { window: x.r.final.window, amount: 301 },
      x.players[0],
    ),
  );
  assert.throws(() => x.cmd("finalOpen"), /Wait/);
  x.cmd("finalDefault", { entity: "a" });
  x.cmd("finalOpen");
  assert.equal(tick(x.r, x.r.deadline), true);
  assert.equal(x.r.phase, "finalReview");
  x.cmd("finalJudge", { entity: "a", correct: false });
  x.cmd("finish");
  x.cmd("restart");
  assert.equal(x.r.phase, "lobby");
  assert.equal(x.r.used.length, 0);
  assert.equal(x.r.players.length, 4);
});
test("skipping unplayed clues requires explicit confirmation", () => {
  const x = setup();
  x.cmd("start");
  assert.throws(() => x.cmd("nextRound"), /Clues remain/);
  x.cmd("finalBegin", { skip: true });
  assert.equal(x.r.round, 0);
  assert.equal(x.r.pack.rounds.length, 1);
  assert.equal(x.r.phase, "finalWagers");
});
test("malformed or duplicate pack IDs are rejected and question text stays literal", () => {
  const p = structuredClone(starterPack);
  p.rounds[0].categories[1].clues[0].id = p.rounds[0].categories[0].clues[0].id;
  assert.equal(packSchema.safeParse(p).success, false);
  const x = setup();
  x.r.pack.rounds[0].categories[0].clues[0].question =
    "<script>alert(1)</script>";
  live(x);
  assert.equal(
    view(x.r, x.players[0]).active.question,
    "<script>alert(1)</script>",
  );
});
test("room expiry prevents any new actions or joins", () => {
  const x = setup();
  x.r.expiresAt = now - 1;
  assert.throws(() => x.cmd("start"), /expired/);
  assert.throws(
    () => joinRoom(x.r, { name: "Guest", role: "spectator" }, now),
    /expired/,
  );
});

test("only the last correct player selects, including a non-captain teammate; their Daily Double stays theirs", () => {
  const x = setup("teams");
  x.cmd("start");
  const online = new Set(x.r.sessions.map((s) => s.id));
  const play = (type, payload, s = x.host, revision = x.r.revision) =>
    act(
      x.r,
      s,
      { id: randomUUID(), type, payload, revision },
      Math.max(now, x.r.active?.opensAt || 0),
      online,
    );
  assert.equal(view(x.r, x.players[0], online).me.canSelect, true);
  assert.equal(view(x.r, x.host, online).me.canSelect, false);
  for (const s of [x.host, x.players[1], x.players[2]])
    assert.throws(
      () => play("select", { clueId: "r0c0q0" }, s),
      /last answered correctly/,
    );
  play("select", { clueId: "r0c0q0" }, x.players[0]);
  // Unit test supplies the common opening time; readiness itself is covered by multi-client tests.
  x.cmd("openBuzz");
  buzz(x, 2);
  x.cmd("judge", { correct: true });
  assert.equal(x.r.selectorId, x.players[2].playerId);
  x.cmd("continue");
  assert.equal(view(x.r, x.players[2], online).me.canSelect, true);
  assert.equal(view(x.r, x.players[0], online).me.canSelect, false);
  assert.throws(
    () => play("select", { clueId: "r0c2q2" }, x.players[2], x.r.revision - 1),
    /game changed/,
  );
  play("select", { clueId: "r0c2q2" }, x.players[2]);
  const window = x.r.active.window;
  assert.equal(x.r.active.owner, "a");
  assert.equal(x.r.active.ownerPlayerId, x.players[2].playerId);
  assert.throws(
    () => play("dailyWager", { window, amount: 100 }, x.players[0]),
    /selected/,
  );
  play("dailyWager", { window, amount: 100 }, x.players[2]);
  assert.equal(x.r.active.winner, x.players[2].playerId);
  x.cmd("dailyOpen");
  const q = x.r.pack.rounds[0].categories[2].clues[2];
  const optionId = "c" + q.choices.indexOf(q.answer);
  assert.throws(
    () => play("answer", { window, optionId }, x.players[0]),
    /winning player/,
  );
  play("answer", { window, optionId }, x.players[2]);
  assert.equal(x.r.scores.a, 300);
  assert.equal(x.r.selectorId, x.players[2].playerId);
});

test("wrong answers retain selector; host recovery is explicit or restricted to an offline selector", () => {
  const x = setup();
  live(x);
  buzz(x, 1);
  x.cmd("judge", { correct: false });
  assert.equal(x.r.selectorId, x.players[0].playerId);
  x.cmd("closeClue");
  x.cmd("continue");
  const online = new Set(x.r.sessions.map((s) => s.id));
  const select = () =>
    act(
      x.r,
      x.host,
      {
        id: randomUUID(),
        type: "select",
        revision: x.r.revision,
        payload: { clueId: "r0c0q1" },
      },
      now,
      online,
    );
  assert.throws(select, /last answered correctly/);
  online.delete(x.players[0].id);
  assert.equal(view(x.r, x.host, online).me.canSelect, true);
  select();
  x.cmd("closeClue");
  x.cmd("continue");
  x.cmd("control", { playerId: x.players[3].playerId });
  assert.equal(x.r.selectorId, x.players[3].playerId);
  assert.match(x.r.history[0].text, /passed board control to Dee/);
});

test("all 30 clues lead directly to Final and rematch creates one fresh board", () => {
  const x = setup();
  x.cmd("start");
  for (const q of x.r.pack.rounds[0].categories.flatMap((c) => c.clues)) {
    x.cmd("select", { clueId: q.id });
    if (q.dailyDouble)
      x.cmd(
        "dailyWager",
        { window: x.r.active.window, amount: 0 },
        x.players[0],
      );
    x.cmd("closeClue");
    x.cmd("continue");
  }
  x.cmd("finalBegin");
  assert.equal(x.r.phase, "finalWagers");
  assert.equal(x.r.round, 0);
  assert.equal(x.r.pack.rounds.length, 1);
  x.cmd("finalOpen");
  x.cmd("finalLock");
  x.cmd("finish");
  x.cmd("restart");
  assert.equal(x.r.pack.rounds.length, 1);
  assert.equal(x.r.selectorId, null);
});

test("a legacy room keeps its active board and selector after migration and refresh", () => {
  const x = setup("teams");
  x.cmd("start");
  const board = structuredClone(x.r.pack.rounds[0]);
  board.categories[0].clues[0].id = "legacy-live";
  x.r.pack.rounds.push(board);
  x.r.round = 1;
  delete x.r.rulesVersion;
  delete x.r.selectorId;
  x.cmd("select", { clueId: "legacy-live" });
  assert.equal(x.r.round, 0);
  assert.equal(x.r.pack.rounds.length, 1);
  assert.equal(x.r.active.id, "legacy-live");
  assert.equal(view(x.r, x.players[0]).selectorId, x.players[0].playerId);
});
