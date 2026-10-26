import { testPack } from "./fixtures.js";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
const env = {
  ...process.env,
  XDG_CONFIG_HOME: resolve(".wrangler-config"),
  WRANGLER_LOG_PATH: resolve(".wrangler-logs"),
  WRANGLER_SEND_METRICS: "false",
};
mkdirSync(env.XDG_CONFIG_HOME, { recursive: true });
const storage = resolve(".wrangler/test-" + crypto.randomUUID());
const recoveryStorage = resolve(
  ".wrangler/recovery-test-" + crypto.randomUUID(),
);
let activeStorage = storage;
let server,
  log = "";
function launch() {
  server = spawn(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "dev",
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      "8787",
      "--persist-to",
      activeStorage,
    ],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.on("data", (d) => {
    log += d;
  });
  server.stderr.on("data", (d) => {
    log += d;
  });
}
async function ready() {
  for (let i = 0; i < 150; i++) {
    try {
      const r = await fetch("http://127.0.0.1:8787/api/health");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Cloudflare runtime did not start.\n" + log);
}
async function stop() {
  if (server && server.exitCode === null) {
    const exited = new Promise((r) => server.once("exit", r));
    server.kill("SIGTERM");
    await exited;
  }
}
async function post(path, payload) {
  if (path === "/api/rooms")
    payload = { pack: structuredClone(testPack), ...payload };
  const r = await fetch("http://127.0.0.1:8787" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(b.error);
  return b;
}
async function connect(session) {
  const ws = new WebSocket("ws://127.0.0.1:8787/ws?code=" + session.code),
    client = { ws, state: null },
    waiters = new Map();
  const first = new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error("Persistence connection timed out")),
      5000,
    );
    ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.type === "state") {
        client.state = m.state;
        clearTimeout(t);
        resolve();
      }
      if (waiters.has(m.id)) {
        waiters.get(m.id)(m);
        waiters.delete(m.id);
      }
    });
    ws.once("error", reject);
  });
  ws.once("open", () => ws.send(JSON.stringify({ type: "auth", ...session })));
  await first;
  client.command = async (type, payload = {}) => {
    const id = crypto.randomUUID();
    const result = new Promise((resolve) => waiters.set(id, resolve));
    ws.send(
      JSON.stringify({ id, type, payload, revision: client.state.revision }),
    );
    assert.equal((await result).type, "ack");
  };
  return client;
}
try {
  launch();
  await ready();
  console.log("Testing the actual Cloudflare Worker + Durable Object runtime.");
  const run = spawn(process.execPath, ["--test", "test/multiplayer.test.js"], {
    env: { ...env, TEST_BASE_URL: "http://127.0.0.1:8787" },
    stdio: "inherit",
  });
  const code = await new Promise((r) => run.on("exit", r));
  if (code) throw new Error("Cloudflare multiplayer tests failed.\n" + log);
  // A separate persistence fixture keeps this test independent of the production
  // per-IP creation budget consumed by the multiplayer suite. Do not weaken that limit.
  await stop();
  activeStorage = recoveryStorage;
  launch();
  await ready();
  const h = await post("/api/rooms", {
      name: "Persistence host",
      mode: "individual",
    }),
    sessions = [];
  for (const name of ["One", "Two", "Three", "Four"])
    sessions.push(
      await post("/api/join", { code: h.code, name, role: "player" }),
    );
  const host = await connect(h);
  await host.command("start");
  const entity = host.state.players[0].id;
  await host.command("adjust", {
    entity,
    delta: 600,
    reason: "Recovery verification",
  });
  host.ws.close();
  await stop();
  launch();
  await ready();
  const guest = await connect(sessions[0]);
  assert.equal(guest.state.phase, "board");
  assert.equal(guest.state.scores[entity], 600);
  assert.equal(guest.state.me.playerId, entity);
  guest.ws.close();
  console.log(
    "✔ Cloudflare SQLite state and guest session survive a complete runtime restart",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await stop();
  rmSync(storage, { recursive: true, force: true });
  rmSync(recoveryStorage, { recursive: true, force: true });
}
