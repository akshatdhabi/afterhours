import { randomUUID, randomBytes, createHash } from "node:crypto";
import { starterPack } from "./bank.js";
import { drawPack, shuffleChoices, libraryInfo } from "./library.js";
import { createSchema, packSchema } from "./schema.js";
export const hash = (t) => createHash("sha256").update(t).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export class GameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const fail = (m) => {
  throw new GameError(m);
};
const requireThat = (c, m) => {
  if (!c) fail(m);
};
const integer = (v, min, max) =>
  Number.isSafeInteger(v) && v >= min && v <= max;
export function createRoom(
  code,
  options,
  now = Date.now(),
  ttl = 12 * 3600000,
) {
  const o = createSchema.parse(options),
    secret = token(),
    id = randomUUID();
  const drawn =
    !o.pack && o.packSource === "library" ? drawPack(o.bankHistory) : null;
  const room = {
    code,
    revision: 0,
    optionsVersion: 2,
    rulesVersion: 3,
    createdAt: now,
    expiresAt: now + ttl,
    phase: "lobby",
    round: 0,
    pack: o.pack
      ? shuffleChoices(o.pack)
      : drawn?.pack || shuffleChoices(starterPack),
    packSource: o.pack ? "custom" : o.packSource,
    bankHistory: drawn?.history || o.bankHistory,
    settings: {
      mode: o.mode,
      playerCount: o.playerCount,
      teamCount: Math.min(o.teamCount, o.playerCount),
      penalties: o.penalties,
      strictPhrasing: o.strictPhrasing,
      answerSeconds: o.answerSeconds,
      buzzSeconds: o.buzzSeconds,
      finalSeconds: o.finalSeconds,
    },
    players: [],
    sessions: [
      { id, hash: hash(secret), role: "host", name: o.name, playerId: null },
    ],
    scores: {},
    teams: { a: "The Night Owls", b: "The Wild Cards", c: "The Moonshots" },
    control: null,
    selectorId: null,
    used: [],
    active: null,
    final: null,
    deadline: null,
    paused: false,
    remaining: null,
    history: [],
    receipts: [],
  };
  if (o.hostPlays) room.sessions[0].playerId = addPlayer(room, o.name).id;
  return { room, token: secret, sessionId: id };
}
function addPlayer(r, name) {
  const p = {
    id: randomUUID(),
    name,
    team: teamIds(r)[r.players.length % teamIds(r).length],
  };
  r.players.push(p);
  r.scores[entity(r, p)] ??= 0;
  return p;
}
export const teamIds = (r) =>
  ["a", "b", "c"].slice(0, r.settings.teamCount || 2);
export function entity(r, p) {
  return r.settings.mode === "teams" ? p.team : p.id;
}
export function entities(r) {
  return [...new Set(r.players.map((p) => entity(r, p)))];
}
export function entityName(r, e) {
  return r.settings.mode === "teams"
    ? r.teams[e]
    : r.players.find((p) => p.id === e)?.name || "Player";
}
export function joinRoom(r, { name, role }, now = Date.now()) {
  requireThat(r.expiresAt > now, "This room has expired. Create a new game.");
  requireThat(r.sessions.length < 24, "This room has reached its guest limit.");
  requireThat(
    name && typeof name === "string" && name.trim().length <= 24,
    "Choose a name of up to 24 characters.",
  );
  const playing = role === "player";
  requireThat(
    !playing || r.phase === "lobby",
    "The game has started. Join as a spectator, or reconnect on your original browser.",
  );
  requireThat(
    !playing || r.players.length < (r.settings.playerCount || 4),
    "All player seats are taken. You can join as a spectator.",
  );
  requireThat(
    !playing ||
      !r.players.some(
        (p) => p.name.toLowerCase() === name.trim().toLowerCase(),
      ),
    "That player name is taken. Choose another.",
  );
  const secret = token(),
    p = playing ? addPlayer(r, name.trim()) : null;
  const s = {
    id: randomUUID(),
    hash: hash(secret),
    role: playing ? "player" : "spectator",
    playerId: p?.id || null,
    name: name.trim(),
  };
  r.sessions.push(s);
  r.revision++;
  return { token: secret, sessionId: s.id };
}
export function sessionFor(r, secret) {
  return r.sessions.find((s) => s.hash === hash(secret));
}
function clueFor(r, id) {
  return r.pack.rounds[r.round].categories
    .flatMap((c) => c.clues)
    .find((q) => q.id === id);
}
function captain(r, e) {
  return r.players.find((p) => entity(r, p) === e)?.id;
}
function log(r, text) {
  r.history.unshift({ id: randomUUID(), text });
  r.history = r.history.slice(0, 30);
}
function score(r, e, delta, why) {
  r.scores[e] = (r.scores[e] || 0) + delta;
  log(
    r,
    `${entityName(r, e)} ${delta >= 0 ? "+" : "−"}${Math.abs(delta)} · ${why}`,
  );
}
function reveal(r) {
  r.phase = "revealed";
  r.deadline = null;
  if (!r.used.includes(r.active.id)) r.used.push(r.active.id);
}
function openBuzz(r, now) {
  r.phase = "buzzOpen";
  // Publish the future opening once; clients render GO from their synced clocks.
  r.active.opensAt = now + 3000;
  r.deadline = r.active.opensAt + r.settings.buzzSeconds * 1000;
}
function prepareBuzz(r, now, connected) {
  r.phase = "arming";
  r.active.winner = null;
  r.active.selection = null;
  r.active.window = randomUUID();
  r.active.opensAt = null;
  r.active.readyPlayers = [];
  r.active.expectedPlayers = r.players
    .filter(
      (p) =>
        !r.active.locked.includes(entity(r, p)) &&
        (!connected ||
          r.sessions.some((s) => s.playerId === p.id && connected.has(s.id))),
    )
    .map((p) => p.id);
  r.deadline = now + 12000;
  if (!r.active.expectedPlayers.length) openBuzz(r, now);
}
function feedback(r, correct, side, delta, now, reason = "") {
  const a = r.active;
  r.feedback = {
    id: randomUUID(),
    kind: correct ? "correct" : "wrong",
    playerId: a.winner,
    entity: side,
    optionId: a.selection?.optionId || null,
    delta,
    at: now,
    reason,
  };
  if (!correct && a.selection?.optionId) {
    a.missedOptions ||= [];
    if (!a.missedOptions.includes(a.selection.optionId))
      a.missedOptions.push(a.selection.optionId);
  }
}
export function optionsFor(q) {
  return (q.choices || []).map((text, i) => ({ id: "c" + i, text }));
}
function adjudicate(r, correct, now, connected) {
  const a = r.active,
    q = clueFor(r, a.id),
    side =
      a.owner ||
      entity(
        r,
        r.players.find((p) => p.id === a.winner),
      );
  if (correct) {
    feedback(r, true, side, a.wager ?? q.value, now);
    score(r, side, a.wager ?? q.value, a.owner ? "Daily Double" : "correct");
    r.control = side;
    r.selectorId = a.winner;
    reveal(r);
  } else incorrect(r, now, connected);
}
function lockFinal(r) {
  r.phase = "finalReview";
  r.deadline = null;
  if (r.pack.final.choices)
    for (const side of r.final.eligible) {
      const entry = r.final.entries[side],
        selected = optionsFor(r.pack.final).find(
          (o) => o.id === entry?.optionId,
        );
      r.final.results[side] =
        !!selected && selected.text === r.pack.final.answer;
    }
}
export function upgradeRoom(r) {
  const original = [
    ...starterPack.rounds.flatMap((r) => r.categories.flatMap((c) => c.clues)),
    starterPack.final,
  ];
  for (const q of [
    ...r.pack.rounds.flatMap((r) => r.categories.flatMap((c) => c.clues)),
    r.pack.final,
  ]) {
    if (!q.choices) {
      const match = original.find((x) => x.question === q.question);
      if (match) q.choices = [...match.choices];
    }
  }
  if (
    !r.optionsVersion &&
    ["board", "lobby"].includes(r.phase) &&
    [
      ...r.pack.rounds.flatMap((r) => r.categories.flatMap((c) => c.clues)),
      r.pack.final,
    ].every((q) => q.choices?.length === 4)
  ) {
    r.pack = shuffleChoices(r.pack);
    r.optionsVersion = 2;
  }
  // Preserve an in-flight clue when upgrading an older two-board room.
  // The current board becomes the sole board; Final and scores remain intact.
  if (r.rulesVersion !== 3) {
    r.pack.rounds = [r.pack.rounds[r.round] || r.pack.rounds[0]];
    r.round = 0;
    r.selectorId =
      r.players.find((p) => entity(r, p) === r.control)?.id ||
      r.players[0]?.id ||
      null;
    if (r.active?.owner)
      r.active.ownerPlayerId ||= r.active.winner || r.selectorId;
    r.rulesVersion = 3;
  }
  r.settings.playerCount ||= 4;
  r.settings.teamCount ||= 2;
  r.teams.c ||= "The Moonshots";
  r.packSource ||= "starter";
  r.bankHistory ||= "";
  return r;
}
function incorrect(r, now, connected) {
  const a = r.active,
    q = clueFor(r, a.id),
    e =
      a.owner ||
      entity(
        r,
        r.players.find((p) => p.id === a.winner),
      );
  feedback(
    r,
    false,
    e,
    a.owner || r.settings.penalties ? -(a.wager ?? q.value) : 0,
    now,
  );
  // A wager always has downside, including when ordinary wrong-answer penalties are disabled.
  if (a.owner || r.settings.penalties)
    score(r, e, -(a.wager ?? q.value), a.owner ? "Daily Double" : "incorrect");
  if (a.owner) return reveal(r);
  if (!a.locked.includes(e)) a.locked.push(e);
  if (entities(r).every((x) => a.locked.includes(x))) reveal(r);
  else prepareBuzz(r, now, connected);
}
export function tick(r, now = Date.now(), connected) {
  if (r.paused || !r.deadline || now < r.deadline) return false;
  if (r.phase === "arming") {
    r.phase = "clueReading";
    r.deadline = null;
    log(
      r,
      "Some players did not confirm readiness. Check connections and retry the signal.",
    );
  } else if (r.phase === "buzzOpen") {
    reveal(r);
    log(r, "Time’s up · clue closed");
  } else if (r.phase === "answering" || r.phase === "dailyAnswer") {
    incorrect(r, now, connected);
    log(r, "Answer time expired");
  } else if (r.phase === "finalAnswer") {
    lockFinal(r);
    log(r, "Final answers locked");
  } else return false;
  r.revision++;
  return true;
}
const hostActions = new Set([
  "configure",
  "team",
  "kick",
  "start",
  "openBuzz",
  "judge",
  "closeClue",
  "continue",
  "control",
  "adjust",
  "nextRound",
  "finalBegin",
  "finalOpen",
  "finalLock",
  "finalJudge",
  "finish",
  "pause",
  "pack",
  "restart",
  "newPack",
]);
function canSelect(r, s, connected = new Set()) {
  if (s.playerId && s.playerId === r.selectorId) return true;
  const selectorOnline = r.sessions.some(
    (x) => x.playerId === r.selectorId && connected.has(x.id),
  );
  return s.role === "host" && !selectorOnline;
}
export function act(r, s, c, now = Date.now(), connected) {
  upgradeRoom(r);
  requireThat(r.expiresAt > now, "This room has expired.");
  requireThat(
    s && r.sessions.some((x) => x.id === s.id),
    "Your session is no longer active.",
  );
  if (r.receipts.some((x) => x === `${s.id}:${c.id}`)) return false;
  if (hostActions.has(c.type)) {
    requireThat(s.role === "host", "Only the host can do that.");
    requireThat(
      c.revision === r.revision,
      "The game changed. Review the board and try again.",
    );
  }
  requireThat(!r.paused || c.type === "pause", "The host has paused the game.");
  const p = r.players.find((p) => p.id === s.playerId),
    e = p ? entity(r, p) : null,
    a = r.active,
    v = c.payload;
  switch (c.type) {
    case "configure": {
      requireThat(
        r.phase === "lobby",
        "Settings are locked after the game starts.",
      );
      const opts = createSchema.parse({ ...r.settings, ...v, name: s.name });
      requireThat(
        opts.playerCount >= r.players.length,
        "Release extra seats before reducing the player count.",
      );
      const resizeTeams = opts.teamCount !== r.settings.teamCount;
      r.settings = {
        ...r.settings,
        mode: opts.mode,
        playerCount: opts.playerCount,
        teamCount: Math.min(opts.teamCount, opts.playerCount),
        penalties: opts.penalties,
        strictPhrasing: opts.strictPhrasing,
        answerSeconds: opts.answerSeconds,
        buzzSeconds: opts.buzzSeconds,
        finalSeconds: opts.finalSeconds,
      };
      if (resizeTeams || r.players.some((p) => !teamIds(r).includes(p.team)))
        r.players.forEach(
          (p, i) => (p.team = teamIds(r)[i % teamIds(r).length]),
        );
      r.scores = Object.fromEntries(entities(r).map((e) => [e, 0]));
      break;
    }
    case "team":
      requireThat(
        r.phase === "lobby" && r.settings.mode === "teams",
        "Teams can be changed in the team lobby.",
      );
      if (v.playerId) {
        const player = r.players.find((p) => p.id === v.playerId);
        requireThat(
          player && teamIds(r).includes(v.team),
          "Choose a player and team.",
        );
        player.team = v.team;
      }
      if (v.name !== undefined) {
        requireThat(
          teamIds(r).includes(v.team) &&
            typeof v.name === "string" &&
            v.name.trim().length > 0 &&
            v.name.length <= 24,
          "Use a team name of 1–24 characters.",
        );
        r.teams[v.team] = v.name.trim();
      }
      r.scores = Object.fromEntries(entities(r).map((e) => [e, 0]));
      break;
    case "kick": {
      requireThat(r.phase === "lobby", "Seats are locked once play starts.");
      const target = r.players.find((p) => p.id === v.playerId);
      requireThat(target && target.id !== s.playerId, "Choose another player.");
      r.players = r.players.filter((p) => p.id !== target.id);
      r.sessions = r.sessions.filter((x) => x.playerId !== target.id);
      break;
    }
    case "newPack": {
      requireThat(r.phase === "lobby", "Change question packs in the lobby.");
      requireThat(
        ["library", "starter"].includes(v.source),
        "Choose the library or starter pack.",
      );
      r.packSource = v.source;
      if (v.source === "library") {
        const draw = drawPack(r.bankHistory);
        r.pack = draw.pack;
        r.bankHistory = draw.history;
      } else r.pack = shuffleChoices(starterPack);
      break;
    }
    case "pack":
      requireThat(
        r.phase === "lobby",
        "Question packs are locked once play starts.",
      );
      r.pack = shuffleChoices(packSchema.parse(v.pack));
      r.packSource = "custom";
      break;
    case "start":
      requireThat(
        packSchema.safeParse(r.pack).success,
        "Import or complete your own question pack before starting.",
      );
      requireThat(
        r.phase === "lobby" && r.players.length === r.settings.playerCount,
        "Fill the selected number of seats before starting.",
      );
      requireThat(
        r.settings.mode !== "teams" ||
          teamIds(r).every((t) => {
            const n = r.players.filter((p) => p.team === t).length;
            return (
              n >= Math.floor(r.players.length / teamIds(r).length) &&
              n <= Math.ceil(r.players.length / teamIds(r).length)
            );
          }),
        "Teams must be nonempty and balanced (sizes can differ by one).",
      );
      r.control = entity(r, r.players[0]);
      r.selectorId = r.players[0].id;
      r.phase = "board";
      log(r, "Lights up. Let’s play!");
      break;
    case "control": {
      const target =
        r.players.find((p) => p.id === v.playerId) ||
        r.players.find((p) => entity(r, p) === v.entity);
      requireThat(
        r.phase === "board" && target,
        "Choose a player while the board is open.",
      );
      r.control = entity(r, target);
      r.selectorId = target.id;
      log(r, `Host passed board control to ${target.name}`);
      break;
    }
    case "select": {
      requireThat(
        r.phase === "board",
        "Return to the board before selecting a clue.",
      );
      requireThat(
        canSelect(r, s, connected),
        "Only the player who last answered correctly can choose. The host can reassign board control.",
      );
      requireThat(
        c.revision === r.revision,
        "The game changed. Review the board and try again.",
      );
      const q = clueFor(r, v.clueId);
      requireThat(q && !r.used.includes(q.id), "That clue is unavailable.");
      r.feedback = null;
      r.active = {
        id: q.id,
        locked: [],
        winner: null,
        window: randomUUID(),
        owner: q.dailyDouble ? r.control : null,
        ownerPlayerId: q.dailyDouble ? r.selectorId : null,
        wager: null,
      };
      r.phase = q.dailyDouble ? "dailyWager" : "clueReading";
      r.deadline = null;
      break;
    }
    case "openBuzz":
      requireThat(
        ["clueReading", "arming"].includes(r.phase) && !a.owner,
        "Buzzers can open after a regular clue is selected.",
      );
      prepareBuzz(r, now, connected);
      break;
    case "readyBuzz":
      requireThat(
        p && ["arming", "buzzOpen"].includes(r.phase) && v.window === a.window,
        "The readiness window has closed.",
      );
      if (r.phase === "buzzOpen") return false;
      if (a.expectedPlayers.includes(p.id) && !a.readyPlayers.includes(p.id))
        a.readyPlayers.push(p.id);
      if (a.expectedPlayers.every((id) => a.readyPlayers.includes(id)))
        openBuzz(r, now);
      break;
    case "buzz":
      requireThat(
        p &&
          r.phase === "buzzOpen" &&
          v.window === a.window &&
          now >= (a.opensAt || 0) &&
          r.deadline > now,
        "Buzzers are closed.",
      );
      requireThat(
        !a.locked.includes(e),
        "Your side has already answered this clue.",
      );
      a.winner = p.id;
      r.phase = "answering";
      r.deadline = now + r.settings.answerSeconds * 1000;
      log(r, `${p.name} buzzed first`);
      break;
    case "dailyWager": {
      requireThat(
        r.phase === "dailyWager" && v.window === a.window,
        "This wager window has closed.",
      );
      requireThat(
        p?.id === a.ownerPlayerId || s.role === "host",
        "The player who selected the Daily Double submits the wager.",
      );
      const max = Math.max(
        r.scores[a.owner] || 0,
        ...r.pack.rounds[r.round].categories.flatMap((c) =>
          c.clues.map((q) => q.value),
        ),
      );
      requireThat(
        integer(v.amount, 0, max),
        `Wager a whole number from 0 to ${max}.`,
      );
      a.wager = v.amount;
      a.winner = a.ownerPlayerId;
      r.phase = "clueReading";
      break;
    }
    case "dailyOpen":
      requireThat(
        s.role === "host" &&
          c.revision === r.revision &&
          r.phase === "clueReading" &&
          a.owner,
        "Only the host can open this answer window.",
      );
      r.phase = "dailyAnswer";
      r.deadline = now + r.settings.answerSeconds * 1000;
      break;
    case "answer": {
      requireThat(
        p &&
          ["answering", "dailyAnswer"].includes(r.phase) &&
          a.winner === p.id &&
          v.window === a.window &&
          r.deadline > now,
        "Only the winning player can answer during this window.",
      );
      const q = clueFor(r, a.id),
        selected = optionsFor(q).find((o) => o.id === v.optionId);
      requireThat(selected, "Choose one of the four available options.");
      a.selection = { playerId: p.id, optionId: selected.id };
      log(r, p.name + " selected " + selected.text);
      adjudicate(r, selected.text === q.answer, now, connected);
      break;
    }
    case "judge": {
      requireThat(
        ["answering", "dailyAnswer"].includes(r.phase) &&
          typeof v.correct === "boolean" &&
          r.deadline > now,
        "There is no live answer to judge.",
      );
      adjudicate(r, v.correct, now, connected);
      break;
    }
    case "closeClue":
      requireThat(
        ["clueReading", "arming", "buzzOpen"].includes(r.phase),
        "Finish judging the live answer first.",
      );
      reveal(r);
      log(r, "Host closed the clue");
      break;
    case "continue":
      requireThat(r.phase === "revealed", "Reveal the clue first.");
      r.active = null;
      r.feedback = null;
      r.phase = "board";
      break;
    case "adjust":
      requireThat(
        ["board", "lobby", "revealed"].includes(r.phase) &&
          entities(r).includes(v.entity) &&
          integer(v.delta, -100000, 100000) &&
          typeof v.reason === "string" &&
          v.reason.trim().length >= 3 &&
          v.reason.length <= 100,
        "Choose a side, whole-number adjustment, and a reason (3–100 characters).",
      );
      score(r, v.entity, v.delta, v.reason.trim());
      break;
    // Older open clients can still send nextRound; it now advances directly to Final.
    case "nextRound":
    case "finalBegin": {
      requireThat(r.phase === "board", "The final follows the question board.");
      requireThat(
        v.skip === true ||
          r.pack.rounds[r.round].categories
            .flatMap((c) => c.clues)
            .every((q) => r.used.includes(q.id)),
        "Clues remain. Choose skip remaining clues to advance.",
      );
      const eligible = entities(r).filter((e) => r.scores[e] > 0);
      r.final = {
        window: randomUUID(),
        eligible,
        entries: {},
        base: structuredClone(r.scores),
        results: {},
      };
      r.phase = "finalWagers";
      log(r, "Final round · private wagers");
      break;
    }
    case "finalWager":
      requireThat(
        r.phase === "finalWagers" &&
          r.final.window === v.window &&
          r.final.eligible.includes(e) &&
          p.id === captain(r, e),
        "Only an eligible side’s first-listed player may wager.",
      );
      requireThat(
        !r.final.entries[e] && integer(v.amount, 0, r.final.base[e]),
        `Wager 0 to ${r.final.base[e] || 0}, once.`,
      );
      r.final.entries[e] = { wager: v.amount, answer: null };
      break;
    case "finalOpen":
      requireThat(r.phase === "finalWagers", "Collect wagers first.");
      requireThat(
        r.final.eligible.every((e) => r.final.entries[e]),
        "Wait for every eligible side to wager, or use the zero-wager fallback.",
      );
      r.phase = "finalAnswer";
      r.deadline = now + r.settings.finalSeconds * 1000;
      break;
    case "finalDefault":
      requireThat(
        s.role === "host" &&
          c.revision === r.revision &&
          r.phase === "finalWagers" &&
          r.final.eligible.includes(v.entity) &&
          !r.final.entries[v.entity],
        "The host can default only a missing wager.",
      );
      r.final.entries[v.entity] = { wager: 0, answer: null };
      log(r, `${entityName(r, v.entity)} defaulted to a zero wager`);
      break;
    case "finalAnswer":
      requireThat(
        r.phase === "finalAnswer" &&
          r.final.window === v.window &&
          r.deadline > now &&
          r.final.entries[e] &&
          p.id === captain(r, e),
        "Your final answer window is closed.",
      );
      requireThat(
        r.final.entries[e].answer === null,
        "Your final answer is already locked.",
      );
      {
        const selected = optionsFor(r.pack.final).find(
          (o) => o.id === v.optionId,
        );
        requireThat(selected, "Choose one of the four final options.");
        r.final.entries[e].answer = selected.text;
        r.final.entries[e].optionId = selected.id;
      }
      break;
    case "finalLock":
      requireThat(r.phase === "finalAnswer", "Answers are not open.");
      lockFinal(r);
      break;
    case "finalJudge": {
      requireThat(
        r.phase === "finalReview" &&
          r.final.entries[v.entity] &&
          typeof v.correct === "boolean",
        "Choose a final answer while review is open.",
      );
      r.final.results[v.entity] = v.correct;
      break;
    }
    case "finish":
      requireThat(
        r.phase === "finalReview" &&
          r.final.eligible.every((e) => e in r.final.results),
        "Judge all final answers first.",
      );
      for (const side of r.final.eligible)
        score(
          r,
          side,
          r.final.entries[side].wager * (r.final.results[side] ? 1 : -1),
          "final round",
        );
      r.phase = "complete";
      r.deadline = null;
      log(r, "That’s a wrap! Ties share the win.");
      break;
    case "pause":
      requireThat(
        !["lobby", "complete"].includes(r.phase),
        "Pause is available during play.",
      );
      if (r.paused) {
        if (r.phase === "buzzOpen" && r.active.opensAt)
          r.active.opensAt += now - r.pausedAt;
        r.paused = false;
        r.deadline = r.remaining === null ? null : now + r.remaining;
        r.remaining = null;
      } else {
        r.paused = true;
        r.pausedAt = now;
        r.remaining =
          r.deadline === null ? null : Math.max(0, r.deadline - now);
        r.deadline = null;
      }
      break;
    case "restart":
      requireThat(
        r.phase === "complete",
        "Finish this game before playing again.",
      );
      if (r.packSource === "library") {
        const draw = drawPack(r.bankHistory);
        r.pack = draw.pack;
        r.bankHistory = draw.history;
      } else r.pack = shuffleChoices(r.pack);
      r.phase = "lobby";
      r.round = 0;
      r.used = [];
      r.active = null;
      r.final = null;
      r.control = null;
      r.selectorId = null;
      r.deadline = null;
      r.scores = Object.fromEntries(entities(r).map((e) => [e, 0]));
      log(r, "Rematch · switch question packs to avoid repeats");
      break;
    default:
      fail("Unknown action.");
  }
  r.revision++;
  r.receipts.push(`${s.id}:${c.id}`);
  r.receipts = r.receipts.slice(-256);
  return true;
}
export function view(r, s, connected = new Set(), now = Date.now()) {
  const host = s.role === "host",
    ownPlayer = r.players.find((p) => p.id === s.playerId),
    ownSide = ownPlayer ? entity(r, ownPlayer) : null;
  const finalPublic = r.phase === "complete",
    finalHost = host && ["finalReview", "complete"].includes(r.phase);
  const a = r.active,
    q = a && clueFor(r, a.id),
    category =
      q &&
      r.pack.rounds[r.round].categories.find((c) =>
        c.clues.some((x) => x.id === q.id),
      );
  return {
    code: r.code,
    revision: r.revision,
    serverNow: now,
    expiresAt: r.expiresAt,
    phase: r.phase,
    round: r.round,
    settings: r.settings,
    paused: r.paused,
    remaining: r.remaining,
    deadline: r.deadline,
    me: {
      id: s.id,
      role: s.role,
      name: s.name,
      playerId: s.playerId,
      entity: ownSide,
      captain: ownSide ? captain(r, ownSide) === s.playerId : false,
      canSelect: r.phase === "board" && canSelect(r, s, connected),
    },
    hostOnline: r.sessions.some(
      (x) => x.role === "host" && connected.has(x.id),
    ),
    players: r.players.map((p) => ({
      ...p,
      entity: entity(r, p),
      online: r.sessions.some(
        (x) => x.playerId === p.id && connected.has(x.id),
      ),
      captain: captain(r, entity(r, p)) === p.id,
    })),
    teams: r.teams,
    scores: r.scores,
    control: r.control,
    selectorId: r.selectorId,
    used: r.used,
    history: r.history,
    feedback: r.feedback || null,
    library: {
      ...libraryInfo,
      active: r.packSource || "starter",
      ...(host ? { history: r.bankHistory || "" } : {}),
    },
    pack: {
      ready: packSchema.safeParse(r.pack).success,
      title: r.pack.title,
      description: r.pack.description,
      rounds: r.pack.rounds.map((r) => ({
        name: r.name,
        categories: r.categories.map((c) => ({
          name: c.name,
          icon: c.icon,
          clues: c.clues.map((q) => ({ id: q.id, value: q.value })),
        })),
      })),
    },
    active: a
      ? {
          ...a,
          category: category.name,
          value: q.value,
          question: r.phase === "dailyWager" ? null : q.question,
          options: r.phase === "dailyWager" ? [] : optionsFor(q),
          ...(host || r.phase === "revealed"
            ? {
                answer: q.answer,
                accepted: q.accepted,
                correctOptionId: optionsFor(q).find((o) => o.text === q.answer)
                  ?.id,
              }
            : {}),
        }
      : null,
    final: r.final
      ? {
          category: r.pack.final.category,
          window: r.final.window,
          eligible: r.final.eligible,
          ...(["finalAnswer", "finalReview", "complete"].includes(r.phase)
            ? {
                question: r.pack.final.question,
                options: optionsFor(r.pack.final),
              }
            : {}),
          ...(finalHost || finalPublic
            ? {
                answer: r.pack.final.answer,
                note: r.pack.final.note,
                accepted: r.pack.final.accepted,
                results: r.final.results,
                correctOptionId: optionsFor(r.pack.final).find(
                  (o) => o.text === r.pack.final.answer,
                )?.id,
              }
            : {}),
          entries: Object.fromEntries(
            r.final.eligible.map((e) => {
              const entry = r.final.entries[e],
                privateAccess = finalPublic || finalHost || ownSide === e;
              return [
                e,
                {
                  wagered: !!entry,
                  submitted: entry?.answer !== null && !!entry,
                  ...(privateAccess && entry
                    ? { wager: entry.wager, answer: entry.answer }
                    : {}),
                },
              ];
            }),
          ),
        }
      : null,
  };
}
