import express from "express";
import helmet from "helmet";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Store } from "./store.js";
import {
  createRoom,
  joinRoom,
  sessionFor,
  act,
  view,
  tick,
  GameError,
} from "./game.js";
import { createSchema, joinSchema, commandSchema } from "./schema.js";
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export async function createApp({
  dbPath = process.env.DB_PATH || "./data/afterhours.sqlite",
  origin = process.env.APP_ORIGIN,
  dev = false,
  ttl = Number(process.env.ROOM_TTL_HOURS || 12) * 3600000,
  maxRooms = Number(process.env.MAX_ROOMS || 500),
} = {}) {
  if (!Number.isFinite(ttl) || ttl < 3600000 || ttl > 48 * 3600000)
    throw new Error("ROOM_TTL_HOURS must be 1–48.");
  if (origin && new URL(origin).origin !== origin)
    throw new Error(
      "APP_ORIGIN must be an exact origin, without a trailing slash.",
    );
  if (process.env.NODE_ENV === "production" && !origin)
    throw new Error(
      "Set APP_ORIGIN to your HTTPS public origin in production.",
    );
  const store = new Store(dbPath),
    app = express(),
    http = createServer(app),
    sockets = new Map(),
    limits = new Map();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  if (!dev)
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'"],
            "style-src": ["'self'", "'unsafe-inline'"],
            "img-src": ["'self'", "data:"],
            "connect-src": ["'self'"],
            "font-src": ["'self'"],
            "object-src": ["'none'"],
            "frame-ancestors": ["'self'"],
            "upgrade-insecure-requests": origin?.startsWith("https:")
              ? []
              : null,
          },
        },
        strictTransportSecurity: origin?.startsWith("https:")
          ? undefined
          : false,
      }),
    );
  app.use(express.json({ limit: "150kb" }));
  const allowed = (req) =>
    !req.headers.origin ||
    req.headers.origin === (origin || `http://${req.headers.host}`);
  function rate(key, max, ms) {
    const now = Date.now();
    let b = limits.get(key);
    if (!b || b.until <= now) {
      b = { n: 0, until: now + ms };
      limits.set(key, b);
    }
    if (++b.n > max)
      throw new GameError(
        "Too many attempts. Take a moment and try again.",
        429,
      );
  }
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!allowed(req))
      return res.status(403).json({ error: "This origin is not allowed." });
    try {
      rate(`api:${req.ip}`, 200, 60000);
      next();
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.post("/api/rooms", (req, res, next) => {
    try {
      rate(`create:${req.ip}`, 8, 3600000);
      store.expire();
      if (store.count() >= maxRooms)
        throw new GameError("The studio is busy. Try again later.", 503);
      const o = createSchema.parse(req.body);
      let code;
      do {
        code = Array.from(
          { length: 6 },
          () => alphabet[randomInt(alphabet.length)],
        ).join("");
      } while (store.cache.has(code) || store.read.get(code));
      const result = createRoom(code, o, Date.now(), ttl);
      store.insert(result.room);
      res
        .status(201)
        .json({ code, token: result.token, sessionId: result.sessionId });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/join", (req, res, next) => {
    try {
      rate(`join:${req.ip}`, 30, 60000);
      const input = joinSchema.parse(req.body);
      const result = store.mutate(input.code, (r) => joinRoom(r, input));
      broadcast(input.code);
      res.status(201).json({ code: input.code, ...result });
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/rooms/:code/pack", (req, res, next) => {
    try {
      const r = store.get(req.params.code),
        s = sessionFor(
          r,
          req.headers.authorization?.replace(/^Bearer /, "") || "",
        );
      if (s?.role !== "host") throw new GameError("Host access required.", 403);
      res.json(r.pack);
    } catch (e) {
      next(e);
    }
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const validation = err.name === "ZodError";
    const status = validation ? 400 : err.status || 500;
    if (status === 500) console.error("Request failed:", err.message);
    res.status(status).json({
      error: validation
        ? err.issues
            .slice(0, 3)
            .map((x) => `${x.path.join(".")}: ${x.message}`)
            .join(" · ")
        : status < 500
          ? err.message
          : "The studio hit a snag. Please try again.",
    });
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 160000,
    perMessageDeflate: false,
  });
  http.on("upgrade", (req, socket, head) => {
    if (dev && req.headers["sec-websocket-protocol"] === "vite-hmr") return;
    if (
      new URL(req.url, "http://localhost").pathname !== "/ws" ||
      !allowed(req) ||
      wss.clients.size >= 500
    )
      return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req),
    );
  });
  const connected = (code) =>
    new Set(
      [...sockets.values()].filter((x) => x.code === code).map((x) => x.id),
    );
  function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 500000)
        return ws.close(1013, "Connection too slow");
      ws.send(JSON.stringify(data));
    }
  }
  function broadcast(code) {
    let room;
    try {
      room = store.get(code);
    } catch {
      for (const [ws, s] of sockets)
        if (s.code === code) {
          send(ws, {
            type: "fatal",
            error: "This room has expired. Create a new game.",
          });
          ws.close(4004, "Room expired");
        }
      return;
    }
    const presence = connected(code);
    for (const [ws, x] of sockets)
      if (x.code === code) {
        const s = room.sessions.find((s) => s.id === x.id);
        if (!s) {
          send(ws, {
            type: "fatal",
            error: "The host released your seat. You can join again.",
          });
          ws.close(4003);
        } else send(ws, { type: "state", state: view(room, s, presence) });
      }
  }
  wss.on("connection", (ws) => {
    ws.alive = true;
    ws.on("pong", () => {
      ws.alive = true;
    });
    const authTimer = setTimeout(
      () => ws.close(4001, "Authentication required"),
      5000,
    );
    ws.on("message", (raw) => {
      let message;
      try {
        if (raw.toString() === "ping") {
          if (sockets.has(ws)) ws.send("pong");
          return;
        }
        message = JSON.parse(raw.toString());
        const known = sockets.get(ws);
        if (!known) {
          if (
            message.type !== "auth" ||
            typeof message.token !== "string" ||
            message.token.length > 100 ||
            !/^[A-Z2-9]{6}$/.test(message.code)
          )
            throw new GameError("Invalid session.", 401);
          const r = store.get(message.code),
            s = sessionFor(r, message.token);
          if (!s)
            throw new GameError("Session not found. Join the room again.", 401);
          const sessions = [...sockets.values()].filter(
            (x) => x.code === r.code && x.id === s.id,
          ).length;
          if (sessions >= 6)
            throw new GameError("Too many tabs for this session.", 429);
          clearTimeout(authTimer);
          sockets.set(ws, { code: r.code, id: s.id });
          broadcast(r.code);
          return;
        }
        rate(`ws:${known.code}:${known.id}`, 180, 10000);
        if (message.type === "clock" && Number.isFinite(message.sentAt)) {
          send(ws, {
            type: "clock",
            sentAt: message.sentAt,
            serverNow: Date.now(),
          });
          return;
        }
        const c = commandSchema.parse(message);
        // Resolve elapsed deadlines before considering any incoming action.
        const current = store.get(known.code);
        if (
          current.deadline &&
          !current.paused &&
          Date.now() >= current.deadline
        )
          store.mutate(known.code, (r) =>
            tick(r, Date.now(), connected(known.code)),
          );
        store.mutate(known.code, (r) =>
          act(
            r,
            r.sessions.find((s) => s.id === known.id),
            c,
            Date.now(),
            connected(known.code),
          ),
        );
        broadcast(known.code);
        send(ws, { type: "ack", id: c.id });
      } catch (e) {
        const status = e.status || 400;
        send(ws, {
          type: !sockets.has(ws) ? "fatal" : "error",
          id: message?.id,
          error:
            e.name === "ZodError"
              ? e.issues.map((x) => x.message).join(" · ")
              : status >= 500
                ? "The studio hit a snag."
                : e.message,
        });
        const known = sockets.get(ws);
        if (known) broadcast(known.code);
        else ws.close(4001, "Session rejected");
      }
    });
    ws.on("close", () => {
      clearTimeout(authTimer);
      const s = sockets.get(ws);
      sockets.delete(ws);
      if (s) broadcast(s.code);
    });
    ws.on("error", () => {});
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) ws.terminate();
      else {
        ws.alive = false;
        ws.ping();
      }
    }
  }, 15000);
  const clock = setInterval(() => {
    for (const r of store.cache.values()) {
      if (r.expiresAt <= Date.now()) {
        broadcast(r.code);
        continue;
      }
      if (r.deadline && !r.paused && Date.now() >= r.deadline) {
        store.mutate(r.code, (draft) =>
          tick(draft, Date.now(), connected(r.code)),
        );
        broadcast(r.code);
      }
    }
  }, 100);
  const cleanup = setInterval(() => {
    store.expire();
    const now = Date.now();
    for (const [k, b] of limits) if (b.until <= now) limits.delete(k);
  }, 60000);
  let vite;
  if (dev) {
    const { createServer: createViteServer } = await import("vite");
    vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: http,
          clientPort: Number(process.env.PORT || 3000),
          path: "/vite-hmr",
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const dist = fileURLToPath(new URL("../dist", import.meta.url));
    app.use(express.static(dist, { index: false, maxAge: "1h" }));
    app.get("/{*path}", (req, res) =>
      res.sendFile(`${dist}/index.html`, {
        headers: { "Cache-Control": "no-cache" },
      }),
    );
  }
  return {
    app,
    http,
    store,
    wss,
    async close() {
      clearInterval(heartbeat);
      clearInterval(clock);
      clearInterval(cleanup);
      for (const ws of wss.clients) ws.terminate();
      if (vite) await vite.close();
      await new Promise((resolve) => {
        wss.close(() => resolve());
      });
      if (http.listening) await new Promise((resolve) => http.close(resolve));
      store.close();
    },
  };
}
