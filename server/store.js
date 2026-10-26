import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { GameError, upgradeRoom } from "./game.js";
export class Store {
  constructor(path) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, expires INTEGER NOT NULL, state TEXT NOT NULL)",
    );
    this.cache = new Map();
    this.read = this.db.prepare("SELECT state FROM rooms WHERE code = ?");
    this.save = this.db.prepare(
      "INSERT INTO rooms VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET expires=excluded.expires, state=excluded.state",
    );
  }
  get(code) {
    if (!this.cache.has(code)) {
      const row = this.read.get(code);
      if (row) this.cache.set(code, upgradeRoom(JSON.parse(row.state)));
    }
    const room = this.cache.get(code);
    if (!room || room.expiresAt <= Date.now())
      throw new GameError(
        "Room not found or expired. Check the code or create a new game.",
        404,
      );
    return room;
  }
  insert(room) {
    this.db
      .prepare("INSERT INTO rooms VALUES (?, ?, ?)")
      .run(room.code, room.expiresAt, JSON.stringify(room));
    this.cache.set(room.code, room);
  }
  mutate(code, fn) {
    // One synchronous authority, with durable commit before any acknowledgement/broadcast.
    // Never put awaits in this critical section. Run exactly ONE process/replica per database.
    const original = this.get(code),
      draft = structuredClone(original);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn(draft);
      this.save.run(code, draft.expiresAt, JSON.stringify(draft));
      this.db.exec("COMMIT");
      this.cache.set(code, draft);
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  count() {
    return this.db.prepare("SELECT count(*) AS n FROM rooms").get().n;
  }
  expire(now = Date.now()) {
    this.db.prepare("DELETE FROM rooms WHERE expires <= ?").run(now);
    for (const [key, r] of this.cache)
      if (r.expiresAt <= now) this.cache.delete(key);
  }
  close() {
    this.db.close();
  }
}
