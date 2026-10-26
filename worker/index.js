import { DurableObject } from "cloudflare:workers";
import {
  createRoom,
  joinRoom,
  sessionFor,
  act,
  view,
  tick,
  hash,
  GameError,
  upgradeRoom,
} from "../server/game.js";
import { createSchema, joinSchema, commandSchema } from "../server/schema.js";
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
function error(e) {
  return json(
    {
      error:
        e.name === "ZodError"
          ? e.issues
              .slice(0, 3)
              .map((x) => `${x.path.join(".")}: ${x.message}`)
              .join(" · ")
          : e.status
            ? e.message
            : "The studio hit a snag. Please try again.",
    },
    e.name === "ZodError" ? 400 : e.status || 500,
  );
}
async function body(req) {
  // Enforce the actual body size, even when Content-Length is absent.
  const reader = req.body?.getReader();
  if (!reader) throw new GameError("A JSON body is required.");
  let size = 0,
    chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 150000) {
      await reader.cancel();
      throw new GameError("Question pack is too large.", 413);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let pos = 0;
  for (const c of chunks) {
    all.set(c, pos);
    pos += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(all));
  } catch {
    throw new GameError("Use valid JSON.");
  }
}
export default {
  async fetch(req, env) {
    const url = new URL(req.url),
      requestOrigin = req.headers.get("Origin");
    const allowed =
      !requestOrigin ||
      requestOrigin === url.origin ||
      requestOrigin === env.ALLOWED_ORIGIN;
    const api = url.pathname.startsWith("/api/") || url.pathname === "/ws";
    if (!api) {
      const res = await env.ASSETS.fetch(req),
        headers = new Headers(res.headers);
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "no-referrer");
      headers.set(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()",
      );
      const connect = env.ALLOWED_ORIGIN ? "'self' https: wss:" : "'self'";
      headers.set(
        "Content-Security-Policy",
        `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src ${connect}; object-src 'none'; frame-ancestors 'self'; base-uri 'self'`,
      );
      return new Response(res.body, { status: res.status, headers });
    }
    if (!allowed) return json({ error: "This origin is not allowed." }, 403);
    const respond = (res) => {
      if (res.status === 101) return res;
      const h = new Headers(res.headers);
      h.set("X-Content-Type-Options", "nosniff");
      h.set("Referrer-Policy", "no-referrer");
      if (requestOrigin && allowed) {
        h.set("Access-Control-Allow-Origin", requestOrigin);
        h.set("Vary", "Origin");
        h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      }
      return new Response(res.body, { status: res.status, headers: h });
    };
    try {
      if (req.method === "OPTIONS")
        return respond(new Response(null, { status: 204 }));
      if (url.pathname === "/api/health") return respond(json({ ok: true }));
      const ip = req.headers.get("CF-Connecting-IP") || "local";
      const limited = async (bucket, limit, period) => {
        const gate = env.GATES.get(
          env.GATES.idFromName(hash(`${ip}:${bucket}`)),
        );
        const r = await gate.fetch(
          new Request("https://gate/check", {
            method: "POST",
            body: JSON.stringify({ limit, period }),
          }),
        );
        if (!r.ok)
          throw new GameError(
            "Too many attempts. Take a moment and try again.",
            429,
          );
      };
      if (url.pathname === "/api/rooms" && req.method === "POST") {
        await limited("create", 8, 3600000);
        const options = createSchema.parse(await body(req));
        const ttl =
          Math.min(48, Math.max(1, Number(env.ROOM_TTL_HOURS || 12))) * 3600000;
        for (let tries = 0; tries < 4; tries++) {
          const bytes = crypto.getRandomValues(new Uint8Array(6)),
            code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join(
              "",
            );
          const room = env.ROOMS.get(env.ROOMS.idFromName(code));
          const res = await room.fetch(
            new Request("https://room/init", {
              method: "POST",
              body: JSON.stringify({ code, options, ttl }),
            }),
          );
          if (res.status !== 409) return respond(res);
        }
        throw new GameError("Please try creating a room again.", 503);
      }
      if (url.pathname === "/api/join" && req.method === "POST") {
        await limited("join", 30, 60000);
        const input = joinSchema.parse(await body(req));
        return respond(
          await env.ROOMS.get(env.ROOMS.idFromName(input.code)).fetch(
            new Request("https://room/join", {
              method: "POST",
              body: JSON.stringify(input),
            }),
          ),
        );
      }
      if (
        url.pathname === "/ws" &&
        req.headers.get("Upgrade")?.toLowerCase() === "websocket"
      ) {
        await limited("socket", 50, 60000);
        const code = url.searchParams.get("code");
        if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code || ""))
          throw new GameError("Invalid room code.");
        return await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(
          new Request("https://room/ws", { headers: { Upgrade: "websocket" } }),
        );
      }
      const pack = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/pack$/);
      if (pack && req.method === "GET") {
        await limited("pack", 20, 60000);
        return respond(
          await env.ROOMS.get(env.ROOMS.idFromName(pack[1])).fetch(
            new Request("https://room/pack", {
              headers: {
                Authorization: req.headers.get("Authorization") || "",
              },
            }),
          ),
        );
      }
      return respond(json({ error: "Endpoint not found." }, 404));
    } catch (e) {
      return respond(error(e));
    }
  },
};
export class RateGate extends DurableObject {
  async fetch(req) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const { limit, period } = await req.json(),
        now = Date.now();
      let b = await this.ctx.storage.get("budget");
      if (!b || now >= b.until) b = { n: 0, until: now + period };
      b.n++;
      await this.ctx.storage.put("budget", b);
      await this.ctx.storage.setAlarm(b.until);
      return json({ ok: b.n <= limit }, b.n <= limit ? 200 : 429);
    });
  }
  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.room = null;
    this.ctx.blockConcurrencyWhile(async () => {
      this.room = (await this.ctx.storage.get("room")) || null;
      if (this.room) upgradeRoom(this.room);
    });
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }
  // Catch errors INSIDE blockConcurrencyWhile: uncaught errors reset a Durable Object.
  async fetch(req) {
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        const path = new URL(req.url).pathname;
        if (path === "/init") {
          if (this.room && this.room.expiresAt > Date.now())
            return json({ error: "Code collision" }, 409);
          const { code, options, ttl } = await req.json(),
            made = createRoom(code, options, Date.now(), ttl);
          await this.save(made.room);
          return json(
            { code, token: made.token, sessionId: made.sessionId },
            201,
          );
        }
        this.valid();
        await this.tick();
        if (path === "/join") {
          const draft = structuredClone(this.room),
            result = joinRoom(draft, await req.json());
          await this.save(draft);
          this.broadcast();
          return json({ code: this.room.code, ...result }, 201);
        }
        if (path === "/pack") {
          const s = sessionFor(
            this.room,
            req.headers.get("Authorization")?.replace(/^Bearer /, "") || "",
          );
          if (s?.role !== "host")
            throw new GameError("Host access required.", 403);
          return json(this.room.pack);
        }
        if (path === "/ws") {
          if (this.ctx.getWebSockets().length >= 48)
            throw new GameError("Too many connections in this room.", 429);
          const pair = new WebSocketPair(),
            [client, server] = Object.values(pair);
          this.ctx.acceptWebSocket(server);
          server.serializeAttachment({ authUntil: Date.now() + 5000 });
          await this.schedule();
          return new Response(null, { status: 101, webSocket: client });
        }
        return json({ error: "Not found" }, 404);
      } catch (e) {
        return error(e);
      }
    });
  }
  valid() {
    if (!this.room || this.room.expiresAt <= Date.now())
      throw new GameError("Room not found or expired. Create a new game.", 404);
  }
  async save(draft) {
    await this.ctx.storage.put("room", draft);
    this.room = draft;
    await this.schedule();
  }
  async schedule() {
    if (!this.room) return;
    const deadlines = [this.room.expiresAt];
    if (this.room.deadline && !this.room.paused)
      deadlines.push(this.room.deadline);
    for (const ws of this.ctx.getWebSockets()) {
      const x = ws.deserializeAttachment();
      if (x?.authUntil) deadlines.push(x.authUntil);
    }
    await this.ctx.storage.setAlarm(
      Math.max(Date.now() + 1, Math.min(...deadlines)),
    );
  }
  connected() {
    return new Set(
      this.ctx
        .getWebSockets()
        .map((w) => w.deserializeAttachment()?.id)
        .filter(Boolean),
    );
  }
  async tick() {
    if (
      this.room?.deadline &&
      !this.room.paused &&
      Date.now() >= this.room.deadline
    ) {
      const draft = structuredClone(this.room);
      if (tick(draft, Date.now(), this.connected())) {
        await this.save(draft);
        this.broadcast();
      }
    }
  }
  send(ws, message) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      try {
        ws.close(1011);
      } catch {}
    }
  }
  broadcast() {
    const sockets = this.ctx
        .getWebSockets()
        .filter((ws) => ws.readyState === 1),
      online = new Set(
        sockets.map((ws) => ws.deserializeAttachment()?.id).filter(Boolean),
      );
    for (const ws of sockets) {
      const x = ws.deserializeAttachment();
      if (!x?.id) continue;
      const s = this.room?.sessions.find((s) => s.id === x.id);
      if (!s) {
        this.send(ws, {
          type: "fatal",
          error: "The host released your seat. Join again.",
        });
        ws.close(4003);
      } else
        this.send(ws, { type: "state", state: view(this.room, s, online) });
    }
  }
  async webSocketMessage(ws, raw) {
    await this.ctx.blockConcurrencyWhile(async () => {
      let message;
      try {
        this.valid();
        if (
          typeof raw !== "string" ||
          new TextEncoder().encode(raw).byteLength > 150000
        )
          throw new GameError("Message too large.", 413);
        message = JSON.parse(raw);
        let x = ws.deserializeAttachment();
        if (!x?.id) {
          if (
            message.type !== "auth" ||
            message.code !== this.room.code ||
            typeof message.token !== "string" ||
            message.token.length > 100
          )
            throw new GameError("Invalid session.", 401);
          const s = sessionFor(this.room, message.token);
          if (!s) throw new GameError("Session not found. Join again.", 401);
          if (
            this.ctx
              .getWebSockets()
              .filter((w) => w.deserializeAttachment()?.id === s.id).length >= 6
          )
            throw new GameError("Too many tabs for this session.", 429);
          ws.serializeAttachment({ id: s.id, n: 0, until: Date.now() + 10000 });
          await this.tick();
          await this.schedule();
          this.broadcast();
          return;
        }
        if (Date.now() >= x.until)
          x = { ...x, n: 0, until: Date.now() + 10000 };
        x.n++;
        ws.serializeAttachment(x);
        if (x.n > 180) throw new GameError("Slow down and try again.", 429);
        if (message.type === "clock" && Number.isFinite(message.sentAt)) {
          this.send(ws, {
            type: "clock",
            sentAt: message.sentAt,
            serverNow: Date.now(),
          });
          return;
        }
        const c = commandSchema.parse(message);
        await this.tick();
        const draft = structuredClone(this.room);
        if (
          act(
            draft,
            draft.sessions.find((s) => s.id === x.id),
            c,
            Date.now(),
            this.connected(),
          )
        )
          await this.save(draft);
        this.broadcast();
        this.send(ws, { type: "ack", id: c.id });
      } catch (e) {
        const x = ws.deserializeAttachment();
        this.send(ws, {
          type: x?.id ? "error" : "fatal",
          id: message?.id,
          error:
            e.name === "ZodError"
              ? "Invalid action. Check the values."
              : e.status
                ? e.message
                : "The studio hit a snag.",
        });
        if (!x?.id) ws.close(4001, "Session rejected");
        else if (this.room) this.broadcast();
      }
    });
  }
  async webSocketClose(ws, code, reason) {
    try {
      ws.close(code, reason);
    } catch {}
    this.broadcast();
    await this.schedule();
  }
  async webSocketError(ws) {
    try {
      ws.close(1011);
    } catch {}
  }
  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (!this.room || this.room.expiresAt <= Date.now()) {
        for (const ws of this.ctx.getWebSockets()) {
          this.send(ws, {
            type: "fatal",
            error: "This room has expired. Thanks for playing!",
          });
          ws.close(4004, "Room expired");
        }
        this.room = null;
        await this.ctx.storage.deleteAll();
        return;
      }
      for (const ws of this.ctx.getWebSockets())
        if (ws.deserializeAttachment()?.authUntil <= Date.now())
          ws.close(4001, "Authentication timed out");
      await this.tick();
      await this.schedule();
    });
  }
}
