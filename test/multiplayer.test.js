import { testPack } from "./fixtures.js";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { createApp } from "../server/app.js";
let instance, base, dir;
const opened = [];
before(async () => {
  if (process.env.TEST_BASE_URL) base = process.env.TEST_BASE_URL;
  else {
    dir = mkdtempSync(join(tmpdir(), "afterhours-test-"));
    instance = await createApp({ dbPath: join(dir, "test.sqlite") });
    await new Promise((r) => instance.http.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${instance.http.address().port}`;
  }
});
after(async () => {
  for (const c of opened) c.ws.terminate();
  if (instance) await instance.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});
async function post(path, body) {
  if (path === "/api/rooms")
    body = { pack: structuredClone(testPack), ...body };
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}
async function connect(session, { readyDelay = 0, autoReady = true } = {}) {
  const readyWindows = new Set();
  const url = new URL(base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = `?code=${session.code}`;
  const ws = new WebSocket(url),
    c = { ws, state: null, queue: new Map(), messages: [] };
  opened.push(c);
  ws.on("message", (raw) => {
    if (raw.toString() === "pong") return;
    const m = JSON.parse(raw);
    c.messages.push(m);
    if (m.type === "state") {
      c.state = m.state;
      if (
        autoReady &&
        m.state.phase === "arming" &&
        m.state.me.playerId &&
        !readyWindows.has(m.state.active.window)
      ) {
        readyWindows.add(m.state.active.window);
        const window = m.state.active.window;
        setTimeout(() => {
          if (ws.readyState === 1)
            ws.send(
              JSON.stringify({
                id: randomUUID(),
                type: "readyBuzz",
                payload: { window },
              }),
            );
        }, readyDelay);
      }
    }
    const pending = c.queue.get(m.id);
    if (pending && ["ack", "error", "fatal"].includes(m.type)) {
      c.queue.delete(m.id);
      clearTimeout(pending.timer);
      pending.resolve(m);
    }
  });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  ws.send(JSON.stringify({ type: "auth", ...session }));
  await wait(() => c.state || c.messages.some((m) => m.type === "fatal"));
  c.command = async (type, payload = {}, extra = {}) => {
    const id = randomUUID();
    const answer = new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ type: "timeout" }), 5000);
      c.queue.set(id, { resolve, timer });
    });
    ws.send(
      JSON.stringify({
        type,
        payload,
        id,
        revision: c.state.revision,
        ...extra,
      }),
    );
    return await answer;
  };
  c.ok = async (type, payload = {}, extra = {}) => {
    const m = await c.command(type, payload, extra);
    assert.equal(m.type, "ack", m.error);
    return m;
  };
  return c;
}
async function wait(fn, milliseconds = 6500) {
  for (let i = 0; i < Math.ceil(milliseconds / 15); i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error("Timed out waiting for synchronized state");
}
async function pick(host, players, clueId) {
  await wait(() =>
    players.every(
      (c) =>
        c.state.phase === "board" && c.state.revision === host.state.revision,
    ),
  );
  const selector = players.find(
    (c) => c.state.me.playerId === host.state.selectorId,
  );
  const result = await selector.ok("select", { clueId });
  // An ack on the selecting socket does not mean the host socket has received
  // its matching projection yet. Wait before issuing revision-guarded host actions.
  const revision = selector.state.revision;
  await wait(
    () =>
      host.state.revision >= revision &&
      players.every((p) => p.state.revision === host.state.revision),
  );
  return result;
}
async function readyToBuzz(players) {
  await wait(() =>
    players.every(
      (c) =>
        c.state.phase === "buzzOpen" &&
        Date.now() >= c.state.active.opensAt + 35,
    ),
  );
}
async function game(mode = "individual") {
  const h = await post("/api/rooms", {
    name: "Host",
    packSource: "starter",
    mode,
  });
  const sessions = await Promise.all(
    ["Ada", "Bo", "Cam", "Dee"].map((name) =>
      post("/api/join", { code: h.code, name, role: "player" }),
    ),
  );
  const host = await connect(h),
    players = await Promise.all(sessions.map(connect));
  await wait(
    () =>
      host.state.players.length === 4 &&
      players.every((p) => p.state.revision === host.state.revision),
  );
  return { h, sessions, host, players };
}
test("10 four-client buzzer races produce one winner and convergent authoritative scores", async () => {
  const { host, players } = await game();
  await host.ok("start");
  const clues = host.state.pack.rounds[0].categories
    .flatMap((c) => c.clues)
    .filter((q) => q.id !== "r0c2q2")
    .slice(0, 10);
  let total = 0;
  for (const q of clues) {
    await pick(host, players, q.id);
    await host.ok("openBuzz");
    await readyToBuzz(players);
    const window = host.state.active.window;
    const results = await Promise.all(
      players.map((c) => c.command("buzz", { window })),
    );
    assert.equal(results.filter((x) => x.type === "ack").length, 1);
    assert.equal(results.filter((x) => x.type === "error").length, 3);
    await wait(() =>
      players.every((c) => c.state.active.winner === host.state.active.winner),
    );
    assert.ok(players.every((c) => c.state.active.answer === undefined));
    const winner = players.find(
      (c) => c.state.me.playerId === host.state.active.winner,
    );
    await winner.ok("answer", {
      window: host.state.active.window,
      optionId: host.state.active.correctOptionId,
    });
    await wait(() => host.state.phase === "revealed");
    total += q.value;
    assert.equal(
      Object.values(host.state.scores).reduce((a, b) => a + b, 0),
      total,
    );
    await wait(() =>
      players.every(
        (c) =>
          JSON.stringify(c.state.scores) === JSON.stringify(host.state.scores),
      ),
    );
    await host.ok("continue");
  }
});
test("real team clients share points and lockouts; a refreshed session returns to its seat", async () => {
  const { host, players, sessions } = await game("teams");
  await host.ok("start");
  await pick(host, players, "r0c0q0");
  await host.ok("openBuzz");
  await readyToBuzz(players);
  const first = players[0],
    side = first.state.me.entity,
    mate = players.find((c) => c !== first && c.state.me.entity === side),
    other = players.find((c) => c.state.me.entity !== side);
  await first.ok("buzz", { window: first.state.active.window });
  await wait(() => host.state.phase === "answering");
  const wrongOption = host.state.active.options.find(
    (o) => o.id !== host.state.active.correctOptionId,
  );
  await first.ok("answer", {
    window: first.state.active.window,
    optionId: wrongOption.id,
  });
  await wait(() =>
    [host, ...players].every((c) => c.state.feedback?.kind === "wrong"),
  );
  const verdict = first.state.feedback;
  assert.equal(verdict.playerId, first.state.me.playerId);
  assert.equal(verdict.optionId, wrongOption.id);
  assert.equal(verdict.delta, -200);
  for (const client of [host, ...players])
    assert.deepEqual(client.state.feedback, verdict);
  const reboundRefresh = await connect(sessions[0]);
  assert.deepEqual(reboundRefresh.state.feedback, verdict);
  assert.ok(reboundRefresh.state.active.locked.includes(side));
  reboundRefresh.ws.close();
  await readyToBuzz(players);
  assert.equal(
    (await mate.command("buzz", { window: mate.state.active.window })).type,
    "error",
  );
  await other.ok("buzz", { window: other.state.active.window });
  await wait(() => host.state.phase === "answering");
  await host.ok("judge", { correct: true });
  const original = first.state.me.playerId;
  first.ws.close();
  const resumed = await connect(sessions[0]);
  assert.equal(resumed.state.me.playerId, original);
  assert.deepEqual(resumed.state.scores, host.state.scores);
  assert.equal(resumed.state.players.length, 4);
});
test("server rejects malicious origins and guest access to host answer packs", async () => {
  const res = await fetch(base + "/api/rooms", {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Spy", mode: "individual" }),
  });
  assert.equal(res.status, 403);
  const { host, players, h, sessions } = await game();
  const forbidden = await fetch(base + `/api/rooms/${h.code}/pack`, {
    headers: { Authorization: `Bearer ${sessions[0].token}` },
  });
  assert.equal(forbidden.status, 403);
  const authorized = await fetch(base + `/api/rooms/${h.code}/pack`, {
    headers: { Authorization: `Bearer ${h.token}` },
  });
  assert.equal(authorized.status, 200);
  assert.equal((await authorized.json()).rounds.length, 1);
  await host.ok("start");
  const forged = await players[0].command("adjust", {
    entity: players[0].state.me.entity,
    delta: 99999,
    reason: "Cheating",
  });
  assert.equal(forged.type, "error");
  assert.ok(Object.values(host.state.scores).every((n) => n === 0));
  const ghost = await connect({ code: h.code, token: "invalid" });
  assert.equal(ghost.state, null);
  assert.ok(ghost.messages.some((m) => m.type === "fatal"));
});
test("final wagers and answers remain secret across actual socket clients until review", async () => {
  const { host, players } = await game("teams");
  await host.ok("start");
  for (const e of ["a", "b"])
    await host.ok("adjust", { entity: e, delta: 1000, reason: "Final test" });
  await host.ok("finalBegin", { skip: true });
  await wait(() => players.every((p) => p.state.phase === "finalWagers"));
  const captains = players.filter((p) => p.state.me.captain);
  await Promise.all(
    captains.map((p) =>
      p.ok("finalWager", {
        window: p.state.final.window,
        amount: p.state.me.entity === "a" ? 300 : 400,
      }),
    ),
  );
  await wait(() =>
    host.state.final.eligible.every((e) => host.state.final.entries[e].wagered),
  );
  assert.equal(host.state.final.entries.a.wager, undefined);
  await host.ok("finalOpen");
  await wait(() => players.every((p) => p.state.phase === "finalAnswer"));
  await Promise.all(
    captains.map((p) =>
      p.ok("finalAnswer", {
        window: p.state.final.window,
        optionId: p.state.final.options.find(
          (o) =>
            o.text ===
            (p.state.me.entity === "a"
              ? testPack.final.answer
              : testPack.final.choices[1]),
        ).id,
      }),
    ),
  );
  await wait(() =>
    host.state.final.eligible.every(
      (e) => host.state.final.entries[e].submitted,
    ),
  );
  assert.equal(host.state.final.entries.a.answer, undefined);
  const opponent = players.find((p) => p.state.me.entity === "b");
  assert.equal(opponent.state.final.entries.a.answer, undefined);
  await host.ok("finalLock");
  assert.equal(host.state.final.entries.a.answer, testPack.final.answer);
  await host.ok("finalJudge", { entity: "a", correct: true });
  await host.ok("finalJudge", { entity: "b", correct: false });
  await host.ok("finish");
  await wait(() => players.every((p) => p.state.phase === "complete"));
  assert.deepEqual(host.state.scores, { a: 1300, b: 600 });
  assert.equal(opponent.state.final.entries.a.answer, testPack.final.answer);
});
test(
  "SQLite snapshots survive a local server restart without changing guest capabilities",
  { skip: !!process.env.TEST_BASE_URL },
  async () => {
    const { h, host, sessions } = await game();
    await host.ok("start");
    const scoreId = host.state.players[0].id;
    await host.ok("adjust", {
      entity: scoreId,
      delta: 600,
      reason: "Persistence test",
    });
    for (const c of opened) c.ws.terminate();
    await instance.close();
    instance = await createApp({ dbPath: join(dir, "test.sqlite") });
    await new Promise((r) => instance.http.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${instance.http.address().port}`;
    const resumed = await connect(sessions[0]);
    assert.equal(resumed.state.scores[scoreId], 600);
    assert.equal(resumed.state.phase, "board");
    assert.equal(resumed.state.code, h.code);
  },
);

test("server deadline closes an idle buzz window on every client", async () => {
  const session = await post("/api/rooms", {
    name: "Timer host",
    packSource: "starter",
    mode: "individual",
    buzzSeconds: 5,
  });
  for (const name of ["Clock One", "Clock Two", "Clock Three", "Clock Four"])
    await post("/api/join", { code: session.code, name, role: "player" });
  const host = await connect(session);
  await host.ok("start");
  await host.ok("select", { clueId: "r0c0q0" });
  await host.ok("openBuzz");
  assert.equal(host.state.phase, "buzzOpen");
  await wait(() => host.state.phase === "revealed", 10000);
  assert.ok(host.state.used.includes("r0c0q0"));
  assert.ok(Object.values(host.state.scores).every((n) => n === 0));
});

test("six real clients wait for a delayed phone before sharing GO; early taps and duplicate readiness cannot win", async () => {
  const h = await post("/api/rooms", {
    name: "Playing host",
    mode: "teams",
    playerCount: 6,
    teamCount: 3,
    hostPlays: true,
    packSource: "starter",
  });
  const host = await connect(h),
    clients = [host];
  for (let i = 1; i < 6; i++) {
    const s = await post("/api/join", {
      code: h.code,
      name: "Friend " + i,
      role: "player",
    });
    clients.push(await connect(s, { readyDelay: i === 5 ? 1100 : 0 }));
  }
  await wait(() => host.state.players.length === 6);
  await host.ok("start");
  await host.ok("select", { clueId: "r0c0q0" });
  await host.ok("openBuzz");
  await wait(() => clients.every((c) => c.state.phase === "arming"));
  assert.equal(
    (await clients[0].command("buzz", { window: host.state.active.window }))
      .type,
    "error",
  );
  await wait(() => clients.every((c) => c.state.phase === "buzzOpen"));
  const opening = host.state.active.opensAt,
    window = host.state.active.window;
  assert.ok(clients.every((c) => c.state.active.opensAt === opening));
  assert.ok(Date.now() < opening);
  assert.equal((await host.command("readyBuzz", { window })).type, "ack");
  assert.equal(host.state.active.opensAt, opening);
  assert.equal(
    (await clients[1].command("buzz", { window, clientTimestamp: opening }))
      .type,
    "error",
  );
  await readyToBuzz(clients);
  const race = await Promise.all(
    clients.map((c) => c.command("buzz", { window })),
  );
  assert.equal(race.filter((r) => r.type === "ack").length, 1);
  await wait(() => clients.every((c) => c.state.phase === "answering"));
  assert.equal(new Set(clients.map((c) => c.state.active.winner)).size, 1);
  host.ws.send(JSON.stringify({ type: "clock", sentAt: 12345 }));
  await wait(() =>
    host.messages.some((m) => m.type === "clock" && m.sentAt === 12345),
  );
  assert.ok(
    host.messages.find((m) => m.type === "clock" && m.sentAt === 12345)
      .serverNow > 0,
  );
});

test("a non-captain winning player selects and plays their own Daily Double across refresh", async () => {
  const { host, players, sessions } = await game("teams");
  await host.ok("start");
  await pick(host, players, "r0c0q0");
  await host.ok("openBuzz");
  await readyToBuzz(players);
  const winner = players[2];
  await winner.ok("buzz", { window: winner.state.active.window });
  await wait(() => host.state.phase === "answering");
  await winner.ok("answer", {
    window: winner.state.active.window,
    optionId: host.state.active.correctOptionId,
  });
  await wait(() => host.state.phase === "revealed");
  await host.ok("continue");
  await wait(() =>
    players.every(
      (p) =>
        p.state.phase === "board" && p.state.revision === host.state.revision,
    ),
  );
  assert.equal(winner.state.me.captain, false);
  assert.equal(winner.state.me.canSelect, true);
  assert.equal(winner.state.selectorId, winner.state.me.playerId);
  for (const other of [host, players[0], players[1], players[3]])
    assert.equal(
      (await other.command("select", { clueId: "r0c2q2" })).type,
      "error",
    );
  await winner.ok("select", { clueId: "r0c2q2" });
  await wait(() => host.state.phase === "dailyWager");
  assert.equal(host.state.active.owner, winner.state.me.entity);
  assert.equal(host.state.active.ownerPlayerId, winner.state.me.playerId);
  assert.equal(winner.state.active.question, null);
  const window = winner.state.active.window;
  assert.equal(
    (await players[0].command("dailyWager", { window, amount: 500 })).type,
    "error",
  );
  await winner.ok("dailyWager", { window, amount: 500 });
  await wait(() => host.state.phase === "clueReading");
  await host.ok("dailyOpen");
  const refreshed = await connect(sessions[2]);
  assert.equal(refreshed.state.active.winner, refreshed.state.me.playerId);
  assert.equal(
    refreshed.state.active.ownerPlayerId,
    refreshed.state.me.playerId,
  );
  await refreshed.ok("answer", {
    window,
    optionId: host.state.active.correctOptionId,
  });
  await wait(() =>
    [host, ...players, refreshed].every((p) => p.state.phase === "revealed"),
  );
  for (const c of [host, ...players, refreshed])
    assert.equal(c.state.scores[winner.state.me.entity], 700);
});
