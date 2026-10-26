import React, { useEffect, useRef, useState } from "react";
import { importPackCsv } from "../server/pack-csv.js";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  Crown,
  Download,
  Expand,
  HelpCircle,
  Link,
  LoaderCircle,
  LockKeyhole,
  Minus,
  Monitor,
  Moon,
  Pause,
  Play,
  Plus,
  Radio,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trophy,
  Upload,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import QRCode from "qrcode";
import { packSchema } from "../server/schema.js";
import {
  api,
  API,
  money,
  saved,
  saveSession,
  tone,
  unlockAudio,
  useRoom,
  syncAudio,
  audioSettings,
} from "./client";
import { TurnSignal } from "./GameStatus";
import ShowMoment from "./ShowMoment";
import { CircuitFrame, ReactorRings, ControlFrame } from "./CircuitFrame";
const go = (path) => window.location.assign(path);
const initials = (n) =>
  n
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
function Logo({ onClick }) {
  return (
    <button
      className="logo"
      onClick={onClick || (() => go("/"))}
      aria-label="Afterhours home"
    >
      <span className="logo-star">✳</span> afterhours
    </button>
  );
}
function Button({ children, variant = "", className = "", ...props }) {
  return (
    <button className={`btn ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
function IconButton({ children, label, ...props }) {
  return (
    <button className="icon-btn" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}
function Modal({ title, children, onClose, wide = false, className = "" }) {
  const ref = useRef(),
    prior = useRef();
  useEffect(() => {
    prior.current = document.activeElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current.querySelector("input,button,select,textarea")?.focus();
    const key = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = [
            ...ref.current.querySelectorAll(
              "button,input,select,textarea,a[href]",
            ),
          ].filter((x) => !x.disabled && x.offsetParent !== null),
          first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      prior.current?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className={`modal ${wide ? "wide" : ""} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <CircuitFrame />
        <div className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        {children}
      </section>
    </div>
  );
}
function Rules({ onClose }) {
  return (
    <Modal title="Welcome to your own game show." onClose={onClose} wide>
      <div className="rules-copy">
        <p>
          Two to six friends. One live board. One very good night. Play on your
          phone, or share the same board on a laptop or TV.
        </p>
        <ol>
          <li>
            <strong>Solo or teams.</strong> Two to six individuals, or up to
            three balanced teams. Everyone gets a buzzer. The host may take a
            seat or emcee separately.
          </li>
          <li>
            <strong>Read, buzz, choose.</strong> Every clue has four choices.
            The host gives the signal after reading. Connected players confirm
            readiness, then a shared countdown releases buzzers together. First
            accepted server arrival wins; only that player can choose. Use the
            buzzer or Space, then select one of the four answer cards. The
            server checks the choice and applies the score.
          </li>
          <li>
            <strong>Points and rebounds.</strong> Correct answers add the clue
            value. The last correct player selects the next question; everyone
            can buzz again. The first seat makes the opening pick. Wrong answers
            or timeouts lose the clue value unless ordinary penalties are off.
            Your entire side is locked out; others get a fresh buzzer window.
            Hosts can correct disputes.
          </li>
          <li>
            <strong>Daily Doubles.</strong> One hidden bonus on the single
            board. The player who uncovers it wagers and answers for their side.
            Wager $0 to the greater of your score or the board’s largest clue
            value; the host can submit a fallback. The clue and choices appear
            after the wager locks. Wrong choices always lose that wager.
          </li>
          <li>
            <strong>The final.</strong> Positive-score sides privately wager up
            to their total. First-listed teammates submit one private choice.
            When answers lock, the server grades them; the host can correct a
            judgement before revealing all wagers, choices and scores together.
            Ties share the crown.
          </li>
          <li>
            <strong>Your questions.</strong> Import your own CSV or JSON pack in
            the lobby, or write all 30 clues and the Final in the editor. No
            question library is bundled with this edition. Rematches reuse your
            pack with shuffled choices.
          </li>
        </ol>
        <p className="muted">
          Rooms expire after 12 hours by default. Refresh in the same browser to
          recover your seat; preserve site data. Late arrivals can spectate.
          Internet latency affects buzzing. Playing hosts can see answer keys.
          Remote groups can use their own voice call.
        </p>
        <p className="muted small">
          Community bank:{" "}
          <a
            href="https://github.com/uberspot/OpenTriviaQA"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenTriviaQA contributors
          </a>
          , adapted under{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noopener noreferrer"
          >
            CC BY-SA 4.0
          </a>
          . Normalized, deduplicated and filtered; answers are not all
          independently fact-checked. Hosts can resolve disputes. Independent
          project, not affiliated with Jeopardy!.
        </p>
      </div>
    </Modal>
  );
}
function Preferences({ onClose, muted, setMuted, reduced, setReduced }) {
  const [mix, setMix] = useState(audioSettings);
  const [preview, setPreview] = useState("final");
  function change(key, value) {
    localStorage.setItem("afterhours:" + key, String(value));
    setMix(audioSettings());
    unlockAudio();
    syncAudio();
  }
  return (
    <Modal title="Set the mood." onClose={onClose}>
      <div className="settings-stack">
        <label className="toggle-row">
          <span>
            <strong>Game-show sounds</strong>
            <small>Original cyberpunk signals, impacts and score cues.</small>
          </span>
          <input
            type="checkbox"
            checked={!muted}
            onChange={(e) => {
              setMuted(!e.target.checked);
              unlockAudio();
            }}
          />
        </label>
        <label className="toggle-row">
          <span>
            <strong>Background score</strong>
            <small>
              Dark synths, bass and electronic drums. Quieter while you think.
            </small>
          </span>
          <input
            type="checkbox"
            checked={mix.music}
            onChange={(e) => change("music", e.target.checked)}
          />
        </label>
        <label className="toggle-row">
          <span>
            <strong>Comms announcer</strong>
            <small>
              Low-pitched spoken calls with radio signals. Voice availability
              varies by browser.
            </small>
          </span>
          <input
            type="checkbox"
            checked={mix.voices}
            onChange={(e) => change("voices", e.target.checked)}
          />
        </label>
        <label>
          Studio volume
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={mix.volume}
            onChange={(e) => change("volume", +e.target.value)}
          />
        </label>
        <label>
          Sound preview
          <select value={preview} onChange={(e) => setPreview(e.target.value)}>
            <option value="final">Victory sequence</option>
            <option value="correct">Correct answer</option>
            <option value="wrong">Incorrect answer</option>
            <option value="buzz">Buzzer accepted</option>
            <option value="count">Countdown</option>
            <option value="open">Buzzers open</option>
            <option value="double">Daily Double</option>
            <option value="reveal">Question reveal</option>
          </select>
        </label>
        <Button
          variant="outline"
          onClick={() => {
            localStorage.setItem("afterhours:mute", "false");
            setMuted(false);
            unlockAudio();
            tone(preview);
          }}
        >
          Play sound preview
        </Button>
        <label className="toggle-row">
          <span>
            <strong>Reduce motion</strong>
            <small>Steady lighting. No LED flicker or moving effects.</small>
          </span>
          <input
            type="checkbox"
            checked={reduced}
            onChange={(e) => setReduced(e.target.checked)}
          />
        </label>
        <p className="muted small">
          Sound starts only after you interact with the page. These preferences
          are saved on this device.
        </p>
      </div>
    </Modal>
  );
}
function Entry({ kind, onClose, code = "", display = false }) {
  const [name, setName] = useState(""),
    [room, setRoom] = useState(code),
    [mode, setMode] = useState("individual"),
    [hostPlays, setHostPlays] = useState(true),
    [playerCount, setPlayerCount] = useState(4),
    [teamCount, setTeamCount] = useState(2),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    unlockAudio();
    setBusy(true);
    setError("");
    try {
      if (kind === "join" && saved(room.trim().toUpperCase(), display)) {
        go(`/room/${room.trim().toUpperCase()}${display ? "?display=1" : ""}`);
        return;
      }
      const s = await api(
        kind === "create" ? "/api/rooms" : "/api/join",
        kind === "create"
          ? {
              name,
              mode,
              hostPlays,
              playerCount,
              teamCount,
              bankHistory:
                localStorage.getItem("afterhours:bank-history") || "",
            }
          : {
              name: display ? "Shared screen" : name,
              code: room.trim().toUpperCase(),
              role: display
                ? "spectator"
                : e.nativeEvent.submitter?.value === "spectator"
                  ? "spectator"
                  : "player",
            },
      );
      saveSession(s, display);
      go(`/room/${s.code}${display ? "?display=1" : ""}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        kind === "create"
          ? "Your night starts here."
          : display
            ? "Put it on the big screen."
            : "You’re on the guest list."
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className="entry-form">
        <p className="muted">
          {kind === "create"
            ? "Set the room. Send the link. Let the friendly rivalry begin."
            : "Get the six-character code from your host. No account needed."}
        </p>
        {!display && (
          <label>
            Your name
            <input
              autoComplete="nickname"
              required
              maxLength={24}
              placeholder={
                kind === "create"
                  ? "The host with the most"
                  : "What should we call you?"
              }
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        {kind === "join" ? (
          <label>
            Room code
            <input
              className="code-input"
              autoCapitalize="characters"
              spellCheck={false}
              required
              minLength={6}
              maxLength={6}
              value={room}
              placeholder="ABC234"
              onChange={(e) => setRoom(e.target.value.toUpperCase())}
            />
          </label>
        ) : (
          <>
            <div className="timing-settings">
              <label>
                Total players (including a playing host)
                <select
                  value={playerCount}
                  onChange={(e) => {
                    setPlayerCount(+e.target.value);
                    setTeamCount((n) => Math.min(n, +e.target.value));
                  }}
                >
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} players
                    </option>
                  ))}
                </select>
              </label>
              {mode === "teams" && (
                <label>
                  Teams
                  <select
                    value={teamCount}
                    onChange={(e) => setTeamCount(+e.target.value)}
                  >
                    {[2, 3]
                      .filter((n) => n <= playerCount)
                      .map((n) => (
                        <option key={n} value={n}>
                          {n} teams
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            <fieldset>
              <legend>Pick your rivalry</legend>
              <div className="mode-options">
                <button
                  type="button"
                  className={
                    mode === "individual"
                      ? "mode-option selected"
                      : "mode-option"
                  }
                  aria-pressed={mode === "individual"}
                  onClick={() => setMode("individual")}
                >
                  <Users />
                  <strong>Every friend for themselves</strong>
                  <small>2–6 players · individual scores</small>
                </button>
                <button
                  type="button"
                  className={
                    mode === "teams" ? "mode-option selected" : "mode-option"
                  }
                  aria-pressed={mode === "teams"}
                  onClick={() => setMode("teams")}
                >
                  <ShieldCheck />
                  <strong>Better together</strong>
                  <small>2 or 3 teams · individual buzzers</small>
                </button>
              </div>
            </fieldset>
            <label className="toggle-row">
              <span>
                <strong>I’m playing too</strong>
                <small>
                  You occupy one player seat and run the show from this phone.
                  Choices are graded automatically. The host can see answer
                  keys.
                </small>
              </span>
              <input
                type="checkbox"
                checked={hostPlays}
                onChange={(e) => setHostPlays(e.target.checked)}
              />
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <Button className="full" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" />
          ) : kind === "create" ? (
            <Sparkles size={18} />
          ) : (
            <ArrowRight size={18} />
          )}{" "}
          {kind === "create"
            ? "Create a private room"
            : display
              ? "Open shared display"
              : "Join the game"}
        </Button>
        {kind === "join" && !display && (
          <Button
            variant="quiet"
            className="full"
            type="submit"
            value="spectator"
            disabled={busy}
          >
            Just here to watch
          </Button>
        )}
        <span className="form-foot">
          <LockKeyhole size={12} /> Private room. No accounts. Just good
          company.
        </span>
      </form>
    </Modal>
  );
}
function Landing({ reduced, showEntry, showRules }) {
  const [last, setLast] = useState(null);
  useEffect(() => setLast(localStorage.getItem("afterhours:last")), []);
  return (
    <main className="landing">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <i className="live-dot" /> YOUR NEXT GREAT GAME NIGHT
          </span>
          <h1>
            Good friends.
            <br />
            Big guesses.
            <br />
            <em>Game on.</em>
            <span className="hero-asterisk">✳</span>
          </h1>
          <p>
            Your own live multiplayer game show, wherever your people are.
            <br className="desktop-break" /> Bring your friends. We’ll bring the
            friendly rivalry.
          </p>
          <div className="hero-actions">
            <Button onClick={() => showEntry("create")}>
              Host a game <ArrowUpRight size={20} />
            </Button>
            <Button variant="outline" onClick={() => showEntry("join")}>
              Join with a code <ArrowRight size={17} />
            </Button>
          </div>
          <div className="hero-meta">
            <span>
              <Users size={15} /> 2–6 players · up to 3 teams
            </span>
            <span>
              <Monitor size={15} /> Phones meet big screen
            </span>
          </div>
          {last && saved(last) && (
            <button className="rejoin" onClick={() => go(`/room/${last}`)}>
              Back for more? Reconnect to {last} <ArrowRight size={14} />
            </button>
          )}
        </div>
        <div className="hero-art">
          <div className="stage-halo" />
          <span className="stage-tag">
            <i className="live-dot" /> THE STAGE IS YOURS
          </span>
          <div className="hero-board-art" aria-hidden="true">
            <span className="art-live">
              ON AIR <i />
            </span>
            <div className="art-category-row">
              <span>INDIA</span>
              <span>THE WORLD</span>
              <span>WILD CARD</span>
            </div>
            {[200, 400, 600].map((value) => (
              <div className="art-tile-row" key={value}>
                {[0, 1, 2].map((i) => (
                  <span key={i}>${value}</span>
                ))}
              </div>
            ))}
            <div className="art-buzz">
              <Zap size={24} fill="currentColor" /> YOUR MOMENT
            </div>
          </div>
          <div className="stage-caption">
            <span className="caption-line" />
            <span>
              Small gathering.
              <br />
              <strong>Main-character energy.</strong>
            </span>
            <span className="hand-star">✧</span>
          </div>
          <div className="floating-tag">
            <Zap size={15} fill="currentColor" /> A little knowledge. A lot of
            nerve.
          </div>
        </div>
      </section>
      <div className="ticker">
        <span>NO ACCOUNTS, JUST FRIENDS</span>
        <b>✦</b>
        <span>YOUR PHONE IS YOUR BUZZER</span>
        <b>✦</b>
        <span>ONE ROOM. REAL-TIME RIVALRY.</span>
        <b>✦</b>
        <span>MAKE A NIGHT OF IT</span>
        <b>✦</b>
      </div>
      <section className="how-section">
        <div className="section-intro">
          <span className="eyebrow">LESS SETUP. MORE SHOWTIME.</span>
          <h2>
            From “who’s in?”
            <br />
            to <em>“I knew that!”</em>
          </h2>
          <button className="text-link" onClick={showRules}>
            How the game works <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="how-card">
          <span className="step-num">01 / SET THE SCENE</span>
          <div className="step-art">
            <Radio size={38} />
            <span className="orbit-small">✦</span>
          </div>
          <h3>Your room. Your rules.</h3>
          <p>
            Go solo or team up. Pick a question pack and take your place as
            host.
          </p>
        </div>
        <div className="how-card">
          <span className="step-num">02 / GATHER THE GANG</span>
          <div className="step-art phones">
            <Monitor size={43} />
            <span className="phone-glyph">▯</span>
          </div>
          <h3>One link. Everyone’s in.</h3>
          <p>
            Share the code. Join on phones, put the board on a TV, or play from
            anywhere.
          </p>
        </div>
        <div className="how-card">
          <span className="step-num">03 / TRUST YOUR GUT</span>
          <div className="step-art">
            <Zap size={42} />
            <span className="orbit-small">✧</span>
          </div>
          <h3>Buzz like you mean it.</h3>
          <p>
            Climb the board, risk a Daily Double, and make your final answer
            count.
          </p>
        </div>
      </section>
      <footer className="site-footer">
        <span>Made for the people you’d stay up with.</span>
        <span>
          Independent trivia. Unreasonably good company. <Moon size={13} />
        </span>
      </footer>
    </main>
  );
}
function Invite({ code }) {
  const [qr, setQr] = useState(""),
    [copied, setCopied] = useState("");
  const link = `${location.origin}/room/${code}`;
  useEffect(() => {
    QRCode.toDataURL(link, {
      margin: 0,
      width: 160,
      color: { dark: "#07131d", light: "#ffffff" },
    })
      .then(setQr)
      .catch(() => {});
  }, [link]);
  async function copy(text, kind) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setCopied("Select the code to copy it.");
    }
  }
  return (
    <div className="invite-card">
      <CircuitFrame />
      <div className="invite-intro">
        <span className="eyebrow">YOUR PRIVATE ROOM</span>
        <h3>Invite your friends.</h3>
      </div>
      <div className="invite-code">
        <span>{code}</span>
        <IconButton label="Copy room code" onClick={() => copy(code, "code")}>
          {copied === "code" ? <Check size={19} /> : <Copy size={19} />}
        </IconButton>
      </div>
      <p>Scan the code or share your invite link.</p>
      <div className="qr-wrap">
        {qr && (
          <img
            src={qr}
            width="132"
            height="132"
            alt={`QR code to join room ${code}`}
          />
        )}
      </div>
      <Button variant="ink" className="full" onClick={() => copy(link, "link")}>
        {copied === "link" ? <Check size={16} /> : <Link size={16} />}{" "}
        {copied === "link" ? "Link copied" : "Copy invite link"}
      </Button>
      <a
        className="display-link"
        aria-label="Open shared display on a TV or laptop"
        href={`${link}?display=1`}
        target="_blank"
        rel="noopener"
      >
        <Monitor size={15} /> TV display <ArrowUpRight size={15} />
      </a>
      <span className="small" role="status">
        {copied && !["link", "code"].includes(copied) ? copied : ""}
      </span>
    </div>
  );
}
function PackEditor({ s, session, send, onClose }) {
  const [pack, setPack] = useState(null),
    [error, setError] = useState(""),
    [round, setRound] = useState(0),
    [cat, setCat] = useState(0),
    [clue, setClue] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/api/rooms/${s.code}/pack`, null, session.token)
      .then(setPack)
      .catch((e) => setError(e.message));
  }, []);
  const edit = (path, value) =>
    setPack((p) => {
      const n = structuredClone(p);
      let obj = n;
      for (const k of path.slice(0, -1)) obj = obj[k];
      obj[path.at(-1)] = value;
      return n;
    });
  const path = ["rounds", round, "categories", cat],
    qpath = [...path, "clues", clue],
    q = round === 0 ? pack?.rounds[round]?.categories[cat]?.clues[clue] : null;
  async function importFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    try {
      if (f.size > 145000) throw new Error("Keep your pack under 145 KB.");
      const text = await f.text();
      const p = f.name.toLowerCase().endsWith(".csv")
        ? importPackCsv(text)
        : JSON.parse(text);
      const parsed = packSchema.safeParse(p);
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .slice(0, 3)
            .map((x) => x.message)
            .join(" · "),
        );
      setPack(parsed.data);
      setRound(0);
      setCat(0);
      setClue(0);
      setError("");
    } catch (err) {
      setError(err.message);
    }
    e.target.value = "";
  }
  function download() {
    const a = document.createElement("a"),
      u = URL.createObjectURL(
        new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" }),
      );
    a.href = u;
    a.download = "afterhours-question-pack.json";
    a.click();
    URL.revokeObjectURL(u);
  }
  return (
    <Modal
      title="Make it your kind of trivia."
      wide
      className="pack-editor"
      onClose={onClose}
    >
      <p className="muted">
        Fill in the blank template or import your own CSV or JSON. Save
        validates all 30 clues and the final. Keep one Daily Double on the
        board. Older two-board imports use their first board.
      </p>
      <div className="pack-toolbar">
        <a className="btn outline" href="/question-pack-template.csv" download>
          Download CSV template
        </a>
        <Button variant="outline" onClick={download} disabled={!pack}>
          <Download size={16} /> Export JSON
        </Button>
        <label className="btn outline upload">
          <Upload size={16} /> Import CSV or JSON
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            onChange={importFile}
          />
        </label>
      </div>
      {pack && (
        <>
          <label>
            Pack title
            <input
              maxLength={80}
              value={pack.title}
              onChange={(e) => edit(["title"], e.target.value)}
            />
          </label>
          <div className="editor-selectors">
            <label>
              Round
              <select
                value={round}
                onChange={(e) => {
                  setRound(+e.target.value);
                  setCat(0);
                  setClue(0);
                }}
              >
                <option value="0">Main board</option>
                <option value="1">Final</option>
              </select>
            </label>
            {round === 0 && (
              <>
                <label>
                  Category
                  <select
                    value={cat}
                    onChange={(e) => {
                      setCat(+e.target.value);
                      setClue(0);
                    }}
                  >
                    {pack.rounds[round].categories.map((c, i) => (
                      <option key={i} value={i}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Clue
                  <select
                    value={clue}
                    onChange={(e) => setClue(+e.target.value)}
                  >
                    {pack.rounds[round].categories[cat].clues.map((q, i) => (
                      <option key={i} value={i}>
                        {money(q.value)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
          {round === 0 ? (
            <>
              <label>
                Category name
                <input
                  value={pack.rounds[round].categories[cat].name}
                  maxLength={40}
                  onChange={(e) => edit([...path, "name"], e.target.value)}
                />
              </label>
              <label>
                Clue
                <textarea
                  rows={3}
                  value={q.question}
                  maxLength={1000}
                  onChange={(e) => edit([...qpath, "question"], e.target.value)}
                />
              </label>
              <label>
                Answer
                <input
                  value={q.answer}
                  maxLength={500}
                  onChange={(e) => edit([...qpath, "answer"], e.target.value)}
                />
              </label>
              <div className="choice-editor">
                {q.choices?.map((choice, i) => (
                  <label key={i}>
                    Choice {String.fromCharCode(65 + i)}
                    <input
                      value={choice}
                      maxLength={200}
                      onChange={(e) => {
                        edit([...qpath, "choices", i], e.target.value);
                        if (choice === q.answer)
                          edit([...qpath, "answer"], e.target.value);
                      }}
                    />
                  </label>
                ))}
              </div>
              <label className="toggle-row">
                <span>Daily Double</span>
                <input
                  type="checkbox"
                  checked={q.dailyDouble}
                  onChange={(e) =>
                    edit([...qpath, "dailyDouble"], e.target.checked)
                  }
                />
              </label>
            </>
          ) : (
            <>
              <div className="choice-editor">
                {pack.final.choices?.map((choice, i) => (
                  <label key={i}>
                    Final choice {String.fromCharCode(65 + i)}
                    <input
                      value={choice}
                      maxLength={200}
                      onChange={(e) => {
                        edit(["final", "choices", i], e.target.value);
                        if (choice === pack.final.answer)
                          edit(["final", "answer"], e.target.value);
                      }}
                    />
                  </label>
                ))}
              </div>
              {["category", "question", "answer"].map((k) => (
                <label key={k}>
                  Final {k}
                  <textarea
                    rows={k === "question" ? 3 : 1}
                    value={pack.final[k]}
                    onChange={(e) => edit(["final", k], e.target.value)}
                  />
                </label>
              ))}
            </>
          )}
          <Button
            className="full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              if (await send("pack", { pack })) onClose();
              else
                setError(
                  "Pack was not saved. Check the notification for validation details.",
                );
              setBusy(false);
            }}
          >
            Save question pack <Check size={16} />
          </Button>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
function Lobby({ s, send, session, setPackEditor }) {
  const host = s.me.role === "host";
  const [teamNames, setTeamNames] = useState(s.teams);
  const full = s.players.length === s.settings.playerCount;
  const balanced =
    s.settings.mode !== "teams" ||
    ["a", "b", "c"].slice(0, s.settings.teamCount).every((t) => {
      const n = s.players.filter((p) => p.team === t).length;
      return (
        n >= Math.floor(s.players.length / s.settings.teamCount) &&
        n <= Math.ceil(s.players.length / s.settings.teamCount)
      );
    });
  const missing = s.settings.playerCount - s.players.length;
  const startHint = !full
    ? `Waiting for ${missing} more ${missing === 1 ? "player" : "players"}.`
    : !balanced
      ? "Balance the teams to start the show."
      : "Everyone’s here. Ready when you are.";
  return (
    <div className="lobby-layout">
      <div className="lobby-main">
        <div className="page-heading">
          <span className="eyebrow">
            A LITTLE ANTICIPATION LOOKS GOOD ON YOU
          </span>
          <h1>
            The gang’s <em>almost here.</em>
          </h1>
          <p>
            {s.settings.playerCount} seats. Endless bragging rights.{" "}
            {host
              ? "Set the scene while your friends join."
              : "Get comfortable. Your host will start the show."}
          </p>
        </div>
        <section className="lobby-roster" aria-label="Player seats">
          <div className="lobby-title">
            <h2>
              The green room{" "}
              <span>
                {s.players.length}/{s.settings.playerCount}
              </span>
            </h2>
            <span className="pill">
              <Users size={13} />
              {s.settings.mode === "teams"
                ? `${s.settings.teamCount} teams · individual buzzers`
                : "Every friend for themselves"}
            </span>
          </div>
          <div className="seat-grid">
            {Array.from({ length: s.settings.playerCount }, (_, i) => {
              const p = s.players[i];
              return (
                <div
                  className={`seat ${p ? "occupied" : ""} color-${i}`}
                  key={p?.id || i}
                >
                  <div className="seat-top">
                    <span className="seat-number">SEAT 0{i + 1}</span>
                    {p && (
                      <span className={`presence ${p.online ? "online" : ""}`}>
                        {p.online ? "Connected" : "Away"}
                      </span>
                    )}
                  </div>
                  <div className="avatar">
                    {p ? initials(p.name) : <Plus size={28} />}
                  </div>
                  <h3>{p ? p.name : "Waiting for a friend"}</h3>
                  <p>
                    {p?.id === s.me.playerId
                      ? "That’s you. Make yourself proud."
                      : p
                        ? s.settings.mode === "teams"
                          ? s.teams[p.team]
                          : "Ready for a little friendly rivalry."
                        : "Send them the room link."}
                  </p>
                  {p && s.settings.mode === "teams" && (
                    <label className="seat-team">
                      Team{" "}
                      {host ? (
                        <select
                          value={p.team}
                          onChange={(e) =>
                            send("team", {
                              playerId: p.id,
                              team: e.target.value,
                            })
                          }
                        >
                          {["a", "b", "c"]
                            .slice(0, s.settings.teamCount)
                            .map((t) => (
                              <option key={t} value={t}>
                                {s.teams[t]}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <strong>
                          {s.teams[p.team]}
                          {p.captain ? " · Final captain" : ""}
                        </strong>
                      )}
                    </label>
                  )}
                  {host && p && p.id !== s.me.playerId && (
                    <button
                      className="seat-release"
                      onClick={() => send("kick", { playerId: p.id })}
                    >
                      Release seat
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        <div className="lobby-settings">
          <CircuitFrame />
          <div className="settings-heading">
            <div>
              <span className="eyebrow">TONIGHT’S LINEUP</span>
              <h3>{s.pack.title}</h3>
              <p className="muted">{s.pack.description}</p>
            </div>
            {host && (
              <Button variant="outline" onClick={() => setPackEditor(true)}>
                <Settings2 size={15} /> Edit or import questions
              </Button>
            )}
          </div>
          <div className="settings-stack lobby-form">
            {host ? (
              <>
                <p className="muted wide-field" role="status">
                  {s.pack.ready
                    ? "Your question pack is ready."
                    : "Import your own CSV or JSON pack before starting. No questions are bundled."}
                </p>
                <label>
                  Game mode
                  <select
                    value={s.settings.mode}
                    onChange={(e) =>
                      send("configure", { mode: e.target.value })
                    }
                  >
                    <option value="individual">Individual scores</option>
                    <option value="teams">Team scores</option>
                  </select>
                </label>
                <div className="timing-settings seating-settings">
                  <label>
                    Player seats
                    <select
                      value={s.settings.playerCount}
                      onChange={(e) =>
                        send("configure", { playerCount: +e.target.value })
                      }
                    >
                      {[2, 3, 4, 5, 6].map((n) => (
                        <option
                          key={n}
                          value={n}
                          disabled={n < s.players.length}
                        >
                          {n} players
                        </option>
                      ))}
                    </select>
                  </label>
                  {s.settings.mode === "teams" && (
                    <label>
                      Teams
                      <select
                        value={s.settings.teamCount}
                        onChange={(e) =>
                          send("configure", { teamCount: +e.target.value })
                        }
                      >
                        {[2, 3]
                          .filter((n) => n <= s.settings.playerCount)
                          .map((n) => (
                            <option key={n} value={n}>
                              {n} teams
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                </div>
                <label className="toggle-row wide-field">
                  <span>
                    <strong>Wrong-answer penalties</strong>
                    <small>Lose clue value for incorrect answers.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={s.settings.penalties}
                    onChange={(e) =>
                      send("configure", { penalties: e.target.checked })
                    }
                  />
                </label>

                <div className="timing-settings wide-field">
                  {[
                    ["answerSeconds", "Answer", 5, 30],
                    ["buzzSeconds", "Buzz window", 5, 30],
                    ["finalSeconds", "Final", 15, 120],
                  ].map(([k, name, min, max]) => (
                    <label key={k}>
                      {name}
                      <select
                        value={s.settings[k]}
                        onChange={(e) =>
                          send("configure", { [k]: +e.target.value })
                        }
                      >
                        {[
                          ...new Set(
                            [min, 10, 15, 20, 30, 45, 60, 90, 120].filter(
                              (n) => n >= min && n <= max,
                            ),
                          ),
                        ].map((n) => (
                          <option key={n} value={n}>
                            {n}s
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {s.settings.mode === "teams" && (
                  <div className="team-name-settings wide-field">
                    {["a", "b", "c"].slice(0, s.settings.teamCount).map((t) => (
                      <form
                        key={t}
                        onSubmit={(e) => {
                          e.preventDefault();
                          send("team", { team: t, name: teamNames[t] });
                        }}
                      >
                        <label>
                          Team {t.toUpperCase()} name
                          <div className="input-with-button">
                            <input
                              maxLength={24}
                              value={teamNames[t]}
                              onChange={(e) =>
                                setTeamNames((n) => ({
                                  ...n,
                                  [t]: e.target.value,
                                }))
                              }
                            />
                            <IconButton
                              label={`Save team ${t} name`}
                              type="submit"
                            >
                              <Check size={16} />
                            </IconButton>
                          </div>
                        </label>
                      </form>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="muted">
                {s.settings.penalties
                  ? "Wrong answers lose points."
                  : "Ordinary wrong answers have no penalty."}{" "}
                {s.settings.strictPhrasing
                  ? "Answer in question form."
                  : "Question-form answers are optional."}{" "}
                Answer time: {s.settings.answerSeconds}s. Final:{" "}
                {s.settings.finalSeconds}s.
              </p>
            )}
          </div>
        </div>
        <div className="lobby-bottom">
          {host ? (
            <Button
              disabled={!full || !balanced || !s.pack.ready}
              onClick={() => send("start")}
            >
              Let’s make a night of it <ArrowRight size={18} />
            </Button>
          ) : (
            <span className="waiting-note">
              <LoaderCircle size={18} className="spin" /> Waiting for the host
              to start the show
            </span>
          )}
          <div className="lobby-start-copy">
            {host && <strong role="status">{startHint}</strong>}
            <span>
              <ShieldCheck size={14} /> Only people with your invite can join.
            </span>
          </div>
        </div>
      </div>
      <aside className="lobby-aside">
        <Invite code={s.code} />
        <div className="host-note">
          <Crown size={21} />
          <h3>
            {host ? "A note for the host" : "Everyone gets a front row seat"}
          </h3>
          <p>
            {host
              ? "Read clues and open buzzers. The winning player chooses an answer on their phone; the server checks it. You set the pace and resolve disputes."
              : "Your phone shows the full board. Buzz when the host opens the window, then choose one of four answers on their phone."}
          </p>
          <p className="small">
            Rooms last 12 hours by default. Refresh safely; your seat stays
            yours in this browser.
          </p>
        </div>
      </aside>
    </div>
  );
}
function Scoreboard({ s }) {
  const sides =
    s.settings.mode === "teams"
      ? ["a", "b", "c"].slice(0, s.settings.teamCount)
      : s.players.map((p) => p.id);
  return (
    <div
      className={`scoreboard ${s.settings.mode === "teams" ? "teams" : ""}`}
      aria-label="Scores"
    >
      {sides.map((side, i) => {
        const ps = s.players.filter((p) => p.entity === side),
          name = s.settings.mode === "teams" ? s.teams[side] : ps[0]?.name;
        return (
          <div
            className={`score-card color-${i} ${s.control === side ? "in-control" : ""} ${s.me.entity === side ? "my-score" : ""}`}
            key={side}
          >
            <div className="score-avatar">
              {s.settings.mode === "teams" ? (
                <Users size={18} />
              ) : (
                initials(name || "?")
              )}
            </div>
            <div className="score-who">
              <strong>
                {name}
                {s.me.entity === side && <small> YOU</small>}
              </strong>
              <span>
                {s.phase === "board" && s.control === side
                  ? `${s.players.find((p) => p.id === s.selectorId)?.name || name} picks next`
                  : s.settings.mode === "teams"
                    ? ps.map((p) => p.name).join(" + ")
                    : ps[0]?.online
                      ? "In the room"
                      : "Reconnecting"}
              </span>
            </div>
            <span className="score-value" key={`${side}:${s.scores[side]}`}>
              {money(s.scores[side])}
            </span>
          </div>
        );
      })}
    </div>
  );
}
function Board({ s, send }) {
  const host = s.me.role === "host",
    round = s.pack.rounds[s.round];
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 680px)").matches,
  );
  const [page, setPage] = useState(0);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 680px)");
    const change = () => setCompact(m.matches);
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  useEffect(() => setPage(0), [s.round, compact]);
  const size = compact ? 2 : 6,
    pages = Math.ceil(round.categories.length / size),
    current = Math.min(page, pages - 1);
  return (
    <div className="board-section">
      <div className="board-navigation">
        <span>
          {compact
            ? `Categories ${current * size + 1}–${Math.min((current + 1) * size, 6)} of 6`
            : "Your question board"}
          <small>Top row: familiar · Bottom row: challenging</small>
        </span>
        {pages > 1 && (
          <div role="group" aria-label="Browse categories">
            <button
              aria-label="Previous categories"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronRight style={{ transform: "rotate(180deg)" }} size={18} />
            </button>
            <span aria-live="polite">
              {current + 1} / {pages}
            </span>
            <button
              aria-label="Next categories"
              disabled={current === pages - 1}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>
      <div
        className="game-board"
        role="group"
        aria-label={round.name + " question board"}
      >
        {round.categories
          .slice(current * size, current * size + size)
          .map((c, lane) => (
            <div
              className="category-column"
              key={c.name}
              style={{
                "--circuit-delay": `${-(lane + current * size) * 2.17}s`,
              }}
            >
              <div className="category-name">
                <span className="category-channel" aria-hidden="true">
                  CH.{String(lane + current * size + 1).padStart(2, "0")}
                </span>
                <strong>{c.name}</strong>
              </div>
              {c.clues.map((q) => {
                const used = s.used.includes(q.id);
                return (
                  <button
                    key={q.id}
                    className={`clue-tile ${used ? "used" : ""}`}
                    disabled={used || !s.me.canSelect || s.paused}
                    onClick={() => send("select", { clueId: q.id })}
                    aria-label={`${c.name}, ${money(q.value)}${used ? ", played" : ""}`}
                  >
                    <span className="tile-value">{money(q.value)}</span>
                    <ControlFrame />
                    {used && (
                      <span className="tile-cleared">
                        <Check size={12} aria-hidden="true" /> Cleared
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
}
function Timer({ s }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  if (!s.deadline && !s.paused) return null;
  const n = s.paused
    ? s.remaining
    : Math.max(0, s.deadline - now - (s.clockOffset || 0));
  return (
    <span
      className={`timer ${n < 4000 ? "urgent" : ""}`}
      role="timer"
      aria-label={
        s.paused ? "Paused" : `${Math.ceil(n / 1000)} seconds remaining`
      }
    >
      {s.paused ? <Pause size={14} /> : <i />}
      {s.paused ? "PAUSED" : `${Math.ceil(n / 1000)}s`}
    </span>
  );
}
function Wager({ max, onSubmit, title = "Your wager", disabled = false }) {
  const [amount, setAmount] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="wager-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSubmit(Number(amount));
        setBusy(false);
      }}
    >
      <label>
        {title}
        <div className="wager-input">
          <span>$</span>
          <input
            type="number"
            min={0}
            max={max}
            step={1}
            required
            inputMode="numeric"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={disabled || busy}
          />
        </div>
        <small>$0 to {money(max)} · whole numbers only</small>
      </label>
      <Button disabled={disabled || busy}>
        Lock it in <LockKeyhole size={16} />
      </Button>
    </form>
  );
}
function nameOf(s, e) {
  return s.settings.mode === "teams"
    ? s.teams[e]
    : s.players.find((p) => p.id === e)?.name || "Player";
}
function Choices({ s, send, final = false }) {
  const [busy, setBusy] = useState(false);
  const data = final ? s.final : s.active,
    own = s.final?.entries[s.me.entity];
  const enabled =
    !s.paused &&
    (final
      ? s.phase === "finalAnswer" &&
        s.me.captain &&
        own?.wagered &&
        !own.submitted
      : ["answering", "dailyAnswer"].includes(s.phase) &&
        data.winner === s.me.playerId);
  return (
    <div className="answer-choices" aria-label="Four answer choices">
      {data.options?.map((o, i) => (
        <button
          key={o.id}
          className={
            "answer-choice" +
            (data.correctOptionId === o.id &&
            (s.phase === "revealed" || s.phase === "complete")
              ? " is-correct"
              : "") +
            (own?.answer === o.text ? " is-selected" : "") +
            (!final && data.missedOptions?.includes(o.id) ? " is-wrong" : "")
          }
          disabled={!enabled || busy}
          onClick={async () => {
            setBusy(true);
            await send(final ? "finalAnswer" : "answer", {
              window: final ? s.final.window : s.active.window,
              optionId: o.id,
            });
            setBusy(false);
          }}
        >
          <span>{String.fromCharCode(65 + i)}</span>
          <strong>{o.text}</strong>
          <ControlFrame />
          {data.correctOptionId === o.id &&
          ["revealed", "complete"].includes(s.phase) ? (
            <Check
              className="choice-verdict"
              size={20}
              aria-label="Correct answer"
            />
          ) : !final && data.missedOptions?.includes(o.id) ? (
            <X
              className="choice-verdict"
              size={20}
              aria-label="Incorrect answer"
            />
          ) : null}
        </button>
      ))}
    </div>
  );
}
function Clue({ s, send }) {
  const a = s.active,
    host = s.me.role === "host",
    winner = s.players.find((p) => p.id === a.winner),
    canWager = host || s.me.playerId === a.ownerPlayerId,
    max = Math.max(
      s.scores[a.owner] || 0,
      ...s.pack.rounds[s.round].categories.flatMap((c) =>
        c.clues.map((q) => q.value),
      ),
    );
  const phase = {
    clueReading: a.owner
      ? "A little nerve goes a long way."
      : "Read it. Think it. Wait for your moment.",
    arming: "Checking every connected player’s signal…",
    buzzOpen: "Read the choices. Buzz at GO to answer.",
    answering: `${winner?.name}, the floor is yours.`,
    dailyAnswer: `${nameOf(s, a.owner)}, the floor is yours.`,
    revealed: "And the answer is…",
    dailyWager: "A little twist in the plot.",
  }[s.phase];
  return (
    <section
      className={`clue-stage phase-${s.phase}`}
      aria-labelledby="clue-heading"
    >
      <CircuitFrame />
      <div className="clue-meta">
        <span>
          {a.category} <b>·</b> {a.owner ? "DAILY DOUBLE" : money(a.value)}
        </span>
        <Timer s={s} />
      </div>
      {s.phase === "dailyWager" ? (
        <>
          <div className="daily-symbol">
            <Sparkles size={38} />
          </div>
          <span className="eyebrow">FORTUNE FAVORS THE BRAVE</span>
          <h1 id="clue-heading">
            Daily <em>Double.</em>
          </h1>
          <p>{nameOf(s, a.owner)}, how much do you believe in yourself?</p>
          {canWager ? (
            <Wager
              key={a.id}
              max={max}
              onSubmit={(amount) =>
                send("dailyWager", { window: a.window, amount })
              }
              disabled={s.paused}
            />
          ) : (
            <p className="muted">
              Waiting for{" "}
              {s.players.find((p) => p.id === a.ownerPlayerId)?.name} to lock in
              a wager.
            </p>
          )}
        </>
      ) : (
        <>
          <span className="clue-status" aria-live="polite">
            {phase}
          </span>
          <h1 id="clue-heading" className="clue-question">
            {a.question}
          </h1>
          <Choices s={s} send={send} />
          {a.owner && (
            <span className="wager-chip">Playing for {money(a.wager)}</span>
          )}
          {s.phase === "revealed" && (
            <div className="revealed-answer">
              <span>WHAT IS…</span>
              <strong>{a.answer}</strong>
            </div>
          )}
          {host && s.phase !== "revealed" && (
            <details className="answer-key">
              <summary>
                Host answer key <LockKeyhole size={12} />
              </summary>
              <p>{a.answer}</p>
              {a.accepted?.length > 0 && (
                <small>Also accept: {a.accepted.join(" · ")}</small>
              )}
              {s.settings.strictPhrasing && (
                <small>Require question-form phrasing.</small>
              )}
            </details>
          )}
          <div className="clue-actions">
            {host && s.phase === "clueReading" && (
              <Button
                disabled={s.paused}
                onClick={() => send(a.owner ? "dailyOpen" : "openBuzz")}
              >
                <Zap size={18} />
                {a.owner ? "Start answer timer" : "Open buzzers"}
              </Button>
            )}
            {host && ["answering", "dailyAnswer"].includes(s.phase) && (
              <>
                <Button
                  disabled={s.paused}
                  variant="correct"
                  onClick={() => send("judge", { correct: true })}
                >
                  <Check size={18} /> Correct
                </Button>
                <Button
                  disabled={s.paused}
                  variant="wrong"
                  onClick={() => send("judge", { correct: false })}
                >
                  <X size={18} /> Incorrect
                </Button>
              </>
            )}
            {host && s.phase === "revealed" && (
              <Button disabled={s.paused} onClick={() => send("continue")}>
                Back to the board <ArrowRight size={18} />
              </Button>
            )}
            {host &&
              ["clueReading", "arming", "buzzOpen"].includes(s.phase) && (
                <Button
                  variant="quiet"
                  disabled={s.paused}
                  onClick={() => send("closeClue")}
                >
                  Reveal & close clue
                </Button>
              )}
            {!host && s.phase === "clueReading" && (
              <span className="waiting-note">
                <LockKeyhole size={16} />{" "}
                {a.owner
                  ? "Wait for the host to start your timer"
                  : "Buzzers open when the host gives the signal"}
              </span>
            )}
            {!host && s.phase === "revealed" && (
              <span className="waiting-note">
                The host will take you back to the board.
              </span>
            )}
          </div>
        </>
      )}
      {a.locked.length > 0 && (
        <div className="locked-sides">
          Already answered: {a.locked.map((e) => nameOf(s, e)).join(" · ")}
        </div>
      )}
    </section>
  );
}
function BuzzBar({ s, send, status }) {
  const [busy, setBusy] = useState(false);
  const [, refresh] = useState(0);
  useEffect(() => {
    const id = setInterval(() => refresh((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);
  const a = s.active,
    eligible =
      s.me.playerId && a && !a.owner && !a.locked.includes(s.me.entity),
    open =
      s.phase === "buzzOpen" &&
      Date.now() + (s.clockOffset || 0) >= (a?.opensAt || 0) &&
      !s.paused &&
      status === "live" &&
      eligible;
  async function buzz() {
    if (!open || busy) return;
    setBusy(true);
    await send("buzz", { window: a.window });
    setBusy(false);
  }
  const buzzRef = useRef(buzz);
  buzzRef.current = buzz;
  useEffect(() => {
    const key = (e) => {
      if (
        e.code === "Space" &&
        !e.repeat &&
        !["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(e.target.tagName) &&
        !document.querySelector('[role="dialog"]')
      ) {
        e.preventDefault();
        buzzRef.current();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  if (
    !s.me.playerId ||
    !a ||
    a.owner ||
    a.locked.includes(s.me.entity) ||
    !["arming", "buzzOpen"].includes(s.phase)
  )
    return null;
  const countdown =
    s.phase === "buzzOpen"
      ? Math.max(
          0,
          Math.ceil(
            ((a.opensAt || 0) - Date.now() - (s.clockOffset || 0)) / 1000,
          ),
        )
      : 0;
  return (
    <div className={`buzz-dock ${open ? "signal-armed" : "signal-standby"}`}>
      <div>
        <span className="eyebrow">
          {s.paused
            ? "INTERMISSION"
            : countdown
              ? "THE MOMENT IS COMING"
              : "TRUST YOUR GUT"}
        </span>
        <strong>
          {open
            ? "Know it? Make your move."
            : countdown
              ? "Everyone gets the same GO."
              : "Read the question. Your host will give the signal."}
        </strong>
      </div>
      <span className="buzz-hardware">
        <CircuitFrame />
        <span className="buzz-hardware-label" aria-hidden="true">
          <span>AFTERHOURS / SIGNAL UNIT</span>
          <b>{open ? "● LIVE" : "○ STANDBY"}</b>
        </span>
        <button
          className={`buzz-button ${open ? "ready" : ""} ${busy ? "pending" : ""}`}
          disabled={!open || busy}
          onPointerDown={(e) => {
            e.preventDefault();
            buzz();
          }}
          onClick={(e) => {
            if (e.detail === 0) buzz();
          }}
        >
          <span className="buzz-reactor" aria-hidden="true">
            <ReactorRings />
            <Zap size={25} fill="currentColor" />
          </span>
          <span className="buzz-label">
            {busy
              ? "BUZZ SENT"
              : open
                ? "BUZZ IN"
                : countdown
                  ? `GET READY · ${countdown}`
                  : "BUZZER LOCKED"}
          </span>
          <kbd>SPACE</kbd>
        </button>
        <span className="buzz-telemetry" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <span>
            {open ? "SIGNAL OPEN / TAP TO TRANSMIT" : "AWAITING HOST SIGNAL"}
          </span>
        </span>
      </span>
    </div>
  );
}
function Final({ s, send }) {
  const f = s.final,
    host = s.me.role === "host",
    entry = f.entries[s.me.entity],
    eligible = f.eligible.includes(s.me.entity),
    [answer, setAnswer] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="final-stage">
      <CircuitFrame />
      <div className="clue-meta">
        <span>ONE LAST CHANCE TO CHANGE EVERYTHING</span>
        <Timer s={s} />
      </div>
      <span className="final-star">✧</span>
      <span className="eyebrow">THE FINAL ROUND</span>
      <h1>
        {s.phase === "finalWagers"
          ? "Put your faith"
          : s.phase === "finalAnswer"
            ? "Make your"
            : "The moment"}
        <br />
        <em>
          {s.phase === "finalWagers"
            ? "in a number."
            : s.phase === "finalAnswer"
              ? "final answer."
              : "of truth."}
        </em>
      </h1>
      <span className="final-category">{f.category}</span>
      {f.question && <p className="final-question">{f.question}</p>}
      {s.phase === "finalWagers" && (
        <>
          {eligible && s.me.captain && !entry?.wagered ? (
            <Wager
              max={s.scores[s.me.entity]}
              onSubmit={(amount) =>
                send("finalWager", { window: f.window, amount })
              }
              disabled={s.paused}
            />
          ) : (
            <p className="muted">
              {entry?.wagered
                ? `Your side’s wager of ${money(entry.wager)} is locked. Only your side can see it.`
                : eligible
                  ? "Your first-listed teammate submits the wager."
                  : "Only sides with a positive score enter the final. Enjoy the show."}
            </p>
          )}
          <div className="final-status-list">
            {f.eligible.map((e) => (
              <div key={e}>
                <strong>{nameOf(s, e)}</strong>
                <span>
                  {f.entries[e].wagered ? (
                    <>
                      <LockKeyhole size={13} /> Wager locked
                    </>
                  ) : (
                    "Choosing a wager"
                  )}
                </span>
                {host && !f.entries[e].wagered && (
                  <button
                    onClick={() => send("finalDefault", { entity: e })}
                    disabled={s.paused}
                  >
                    Default to $0
                  </button>
                )}
              </div>
            ))}
          </div>
          {host && (
            <Button
              disabled={
                s.paused || f.eligible.some((e) => !f.entries[e].wagered)
              }
              onClick={() => send("finalOpen")}
            >
              Reveal final clue <ArrowRight size={17} />
            </Button>
          )}
        </>
      )}
      {s.phase === "finalAnswer" && (
        <>
          <Choices s={s} send={send} final />
          <p className="muted">
            {entry?.submitted
              ? "Answer locked. Only your side can see your choice until reveal."
              : eligible
                ? "Choose once. The first-listed teammate submits for the side."
                : "Watch the final unfold."}
          </p>
          <div className="submission-pills">
            {f.eligible.map((e) => (
              <span className="pill" key={e}>
                {nameOf(s, e)}{" "}
                {f.entries[e].submitted ? (
                  <Check size={13} />
                ) : (
                  <LoaderCircle size={13} className="spin" />
                )}
              </span>
            ))}
          </div>
          {host && (
            <Button
              variant="outline"
              disabled={s.paused}
              onClick={() => send("finalLock")}
            >
              Lock answers & start judging
            </Button>
          )}
        </>
      )}
      {s.phase === "finalReview" && (
        <>
          {host ? (
            <>
              <div className="final-answer-key">
                <span>ANSWER KEY</span>
                <strong>{f.answer}</strong>
                <small>{f.note}</small>
              </div>
              <div className="review-list">
                {f.eligible.map((e) => (
                  <div key={e}>
                    <div>
                      <strong>{nameOf(s, e)}</strong>
                      <span>Wager: {money(f.entries[e].wager)}</span>
                      <p>“{f.entries[e].answer || "No answer submitted"}”</p>
                    </div>
                    <div className="review-actions">
                      <Button
                        variant={f.results[e] === true ? "correct" : "outline"}
                        aria-pressed={f.results[e] === true}
                        disabled={s.paused}
                        onClick={() =>
                          send("finalJudge", { entity: e, correct: true })
                        }
                      >
                        <Check size={16} /> Correct
                      </Button>
                      <Button
                        variant={f.results[e] === false ? "wrong" : "outline"}
                        aria-pressed={f.results[e] === false}
                        disabled={s.paused}
                        onClick={() =>
                          send("finalJudge", { entity: e, correct: false })
                        }
                      >
                        <X size={16} /> Incorrect
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                disabled={s.paused || f.eligible.some((e) => !(e in f.results))}
                onClick={() => send("finish")}
              >
                Reveal the winners <Trophy size={18} />
              </Button>
            </>
          ) : (
            <p className="muted">
              Your host is judging the final answers. Scores and wagers reveal
              together.
            </p>
          )}
        </>
      )}
    </section>
  );
}
function Results({ s, send, reduced }) {
  const sides =
      s.settings.mode === "teams"
        ? ["a", "b", "c"].slice(0, s.settings.teamCount)
        : s.players.map((p) => p.id),
    ranked = [...sides].sort((a, b) => s.scores[b] - s.scores[a]),
    winners = ranked.filter((e) => s.scores[e] === s.scores[ranked[0]]);
  return (
    <section className="results">
      <div className="results-content">
        <span className="eyebrow">A NIGHT FOR THE GROUP CHAT</span>
        <Trophy className="trophy" size={48} />
        <h1>
          {winners.map((e) => nameOf(s, e)).join(" & ")}
          <br />
          <em>
            {winners.length > 1 ? "share the crown." : "takes the crown."}
          </em>
        </h1>
        <p>The points are temporary. The bragging rights? Forever.</p>
        <div className="rankings">
          {ranked.map((e, i) => (
            <div key={e}>
              <span>
                {i === 0 ? <Crown size={20} /> : String(i + 1).padStart(2, "0")}
              </span>
              <strong>{nameOf(s, e)}</strong>
              <b>{money(s.scores[e])}</b>
            </div>
          ))}
        </div>
        {s.final && (
          <details className="final-recap">
            <summary>
              The final reveal <ChevronRight size={15} />
            </summary>
            <p>{s.final.question}</p>
            <strong>{s.final.answer}</strong>
            {s.final.eligible.map((e) => (
              <p key={e}>
                {nameOf(s, e)}: “{s.final.entries[e].answer || "No answer"}” ·
                wagered {money(s.final.entries[e].wager)} ·{" "}
                {s.final.results[e] ? "correct" : "incorrect"}
              </p>
            ))}
          </details>
        )}
        <div className="results-actions">
          {s.me.role === "host" && (
            <Button onClick={() => send("restart")}>
              Same friends. Another round? <ArrowRight size={17} />
            </Button>
          )}
          <Button variant="outline" onClick={() => go("/")}>
            Back to the lounge
          </Button>
        </div>
        <small>
          For a rematch, edit or import a new question pack in the lobby.
        </small>
      </div>
    </section>
  );
}
function HostTools({ s, send, onClose }) {
  const [side, setSide] = useState(
      s.me.entity || s.control || Object.keys(s.scores)[0],
    ),
    [delta, setDelta] = useState(""),
    [reason, setReason] = useState(""),
    [skip, setSkip] = useState(false),
    sides =
      s.settings.mode === "teams"
        ? ["a", "b", "c"].slice(0, s.settings.teamCount)
        : s.players.map((p) => p.id);
  return (
    <Modal title="You run the show." onClose={onClose}>
      <div className="settings-stack">
        <p className="muted">
          Score corrections and skipped clues are host decisions. Adjustments
          are recorded in the game’s activity log.
        </p>
        <form
          className="adjust-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await send("adjust", {
                entity: side,
                delta: Number(delta),
                reason,
              })
            )
              onClose();
          }}
        >
          <label>
            Player or team
            <select value={side} onChange={(e) => setSide(e.target.value)}>
              {sides.map((e) => (
                <option key={e} value={e}>
                  {nameOf(s, e)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Score change (use a minus to subtract)
            <input
              type="number"
              min={-100000}
              max={100000}
              step={1}
              required
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
            />
          </label>
          <label>
            Reason
            <input
              minLength={3}
              maxLength={100}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Accepted answer after review"
            />
          </label>
          <Button
            variant="outline"
            disabled={
              s.paused || !["board", "lobby", "revealed"].includes(s.phase)
            }
          >
            Apply score correction
          </Button>
        </form>
        {s.phase === "board" && (
          <>
            <label>
              Pass board control (recovery)
              <select
                value={s.selectorId || ""}
                onChange={(e) => send("control", { playerId: e.target.value })}
                disabled={s.paused}
              >
                {s.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="round-tools">
              <h3>Move to the Final</h3>
              <label className="toggle-row">
                <span>Skip remaining clues on the board</span>
                <input
                  type="checkbox"
                  checked={skip}
                  onChange={(e) => setSkip(e.target.checked)}
                />
              </label>
              <Button
                disabled={s.paused}
                onClick={async () => {
                  if (
                    await send("finalBegin", {
                      skip,
                    })
                  )
                    onClose();
                }}
              >
                Start Final <ArrowRight size={16} />
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
function AccessibleGame({ s, send, reduced, status }) {
  const [tools, setTools] = useState(false),
    host = s.me.role === "host",
    round = s.pack.rounds[s.round],
    total = round.categories
      .flatMap((c) => c.clues)
      .filter((q) => s.used.includes(q.id)).length;
  const isFinal = s.phase.startsWith("final");
  if (s.phase === "complete")
    return <Results s={s} send={send} reduced={reduced} />;
  return (
    <div
      className={`game-layout ${s.me.playerId && s.active ? "has-buzzer" : ""} ${s.active ? "showing-clue" : "showing-board"} ${["arming", "buzzOpen"].includes(s.phase) ? "buzz-focus" : ""}`}
    >
      <div className="game-topline">
        <div>
          <span className="eyebrow">
            {isFinal ? "THE FINAL ROUND" : "ONE BOARD · THEN THE FINAL"}
          </span>
          <h1>
            {isFinal ? "For all the marbles." : round.name}
            <span className="small-star">✳</span>
          </h1>
        </div>
        <div className="game-top-actions">
          {!isFinal && <span className="pill">{total}/30 clues played</span>}
          {host && (
            <>
              <IconButton
                label={s.paused ? "Resume game" : "Pause game"}
                onClick={() => send("pause")}
              >
                {s.paused ? <Play size={18} /> : <Pause size={18} />}
              </IconButton>
              <Button
                variant="outline"
                aria-label="Host controls"
                onClick={() => setTools(true)}
              >
                <Settings2 size={15} />
                <span>Host controls</span>
              </Button>
            </>
          )}
        </div>
      </div>
      <Scoreboard s={s} />
      {s.phase !== "board" && <TurnSignal s={s} status={status} />}
      {s.paused && (
        <div className="paused-banner">
          <Pause size={17} /> A little intermission. The host has paused the
          game.
        </div>
      )}
      {isFinal ? (
        <Final s={s} send={send} />
      ) : s.active ? (
        <Clue s={s} send={send} />
      ) : (
        <>
          <div className="board-instruction">
            <span>
              <i className="live-dot" />
              <strong>
                {total === 30
                  ? "Board cleared. One Final question remains."
                  : s.me.playerId === s.selectorId
                    ? "Your pick. Choose the next question."
                    : `${s.players.find((p) => p.id === s.selectorId)?.name || "Player"} chooses the next question.`}
              </strong>
            </span>
            <span>
              {total === 30
                ? host
                  ? "Start the private Final wagers below."
                  : "Your host will start the private Final wagers."
                : s.me.canSelect
                  ? s.me.playerId === s.selectorId
                    ? "Tap a value. Everyone can buzz for the answer."
                    : "Player disconnected. You may pick for them, or pass control in Host controls."
                  : "Last correct player picks. Everyone can buzz at the signal."}
            </span>
          </div>
          <Board s={s} send={send} />
          <div className="board-footer">
            <span>
              <ShieldCheck size={14} /> Server-arbitrated buzzers. Every point
              counts.
            </span>
            {host && total === 30 && (
              <Button onClick={() => send("finalBegin")}>
                On to the Final <ArrowRight size={16} />
              </Button>
            )}
          </div>
        </>
      )}
      <BuzzBar s={s} send={send} status={status} />
      {s.history.length > 0 && (
        <details className="activity">
          <summary>
            Behind the points <ChevronRight size={15} />
            <span>{s.history[0].text}</span>
          </summary>
          <ol>
            {s.history.map((h) => (
              <li key={h.id}>{h.text}</li>
            ))}
          </ol>
        </details>
      )}
      {tools && <HostTools s={s} send={send} onClose={() => setTools(false)} />}
    </div>
  );
}
function Game({ s, send, reduced, status }) {
  return (
    <div className="play-shell">
      <AccessibleGame s={s} send={send} reduced={reduced} status={status} />
      <ShowMoment s={s} reduced={reduced} />
    </div>
  );
}
function Room({ code, display, reduced }) {
  const [session, setSession] = useState(() => saved(code, display)),
    [joining, setJoining] = useState(false),
    [joinError, setJoinError] = useState(""),
    [packEditor, setPackEditor] = useState(false);
  const { state: s, status, error, setError, send } = useRoom(session);
  useEffect(() => {
    if (s?.me.role === "host" && s.library?.history)
      localStorage.setItem("afterhours:bank-history", s.library.history);
  }, [s?.library?.history]);
  useEffect(() => {
    if (
      s &&
      [
        "board",
        "clueReading",
        "dailyWager",
        "finalWagers",
        "finalAnswer",
        "finalReview",
        "complete",
      ].includes(s.phase)
    ) {
      window.scrollTo(0, 0);
      if (!document.querySelector('[role="dialog"]'))
        document.getElementById("main-content")?.focus({ preventScroll: true });
    }
  }, [s?.phase, s?.active?.id]);
  useEffect(() => {
    if (display && !session) {
      setJoining(true);
      api("/api/join", { name: "Shared screen", code, role: "spectator" })
        .then((x) => {
          saveSession(x, true);
          setSession(x);
        })
        .catch((e) => setJoinError(e.message))
        .finally(() => setJoining(false));
    }
  }, [code]);
  useEffect(() => {
    if (error) {
      const id = setTimeout(() => {
        if (status !== "expired") setError("");
      }, 8000);
      return () => clearTimeout(id);
    }
  }, [error]);
  if (!session)
    return (
      <>
        <div className="room-entry-background">
          <span className="eyebrow">AFTERHOURS · ROOM {code}</span>
          <h1>
            There’s a seat
            <br />
            <em>with your name on it.</em>
          </h1>
          <p>Your friends are one small step away.</p>
          {joinError && <p role="alert">{joinError}</p>}
        </div>
        {!display && <Entry kind="join" code={code} onClose={() => go("/")} />}{" "}
        {joining && <p className="loading-room">Opening shared display…</p>}
      </>
    );
  return (
    <>
      <div className="room-context">
        <span>
          <span
            className={`connection-dot ${status === "live" ? "live" : ""}`}
          />
          {status === "live"
            ? "LIVE & IN SYNC"
            : status === "expired"
              ? "SESSION CLOSED"
              : "RECONNECTING TO THE STUDIO"}
        </span>
        <span className="context-code">
          ROOM <strong>{code}</strong>{" "}
          <span className="context-role">
            {display
              ? "BIG SCREEN"
              : s?.me.role === "host"
                ? "HOST DESK"
                : s?.me.role === "spectator"
                  ? "FRONT ROW"
                  : "PLAYER"}
          </span>
        </span>
      </div>
      {status !== "live" && s && status !== "expired" && (
        <div className="connection-banner" role="status">
          Reconnecting… Controls will resume when the latest state arrives. Your
          seat is reserved.
        </div>
      )}
      {error && (
        <div
          className={`toast ${status === "expired" ? "fatal" : ""}`}
          role="alert"
        >
          <span>{error}</span>
          {status === "expired" ? (
            <button
              onClick={() => {
                localStorage.removeItem(
                  `afterhours:${display ? "display:" : ""}${code}`,
                );
                location.reload();
              }}
            >
              Join again
            </button>
          ) : (
            <IconButton
              label="Dismiss notification"
              onClick={() => setError("")}
            >
              <X size={16} />
            </IconButton>
          )}
        </div>
      )}
      {s && !s.hostOnline && s.me.role !== "host" && (
        <div className="connection-banner" role="status">
          Your host is reconnecting. Game timers continue; your answers and
          scores are saved.
        </div>
      )}
      {s ? (
        <div
          className={status === "live" ? "" : "disconnected-controls"}
          inert={status !== "live" ? true : undefined}
        >
          {s.phase === "lobby" ? (
            <Lobby
              s={s}
              send={send}
              session={session}
              setPackEditor={setPackEditor}
            />
          ) : (
            <Game s={s} send={send} reduced={reduced} status={status} />
          )}
        </div>
      ) : (
        <div className="loading-room">
          <LoaderCircle className="spin" size={32} />
          <h2>Taking you backstage…</h2>
          <p>
            {status === "expired"
              ? "Use “Join again” above to return."
              : "Connecting to your private room."}
          </p>
        </div>
      )}
      {packEditor && s && (
        <PackEditor
          s={s}
          session={session}
          send={send}
          onClose={() => setPackEditor(false)}
        />
      )}
      <span className="sr-only" aria-live="polite">
        {s?.phase === "answering"
          ? `${s.players.find((p) => p.id === s.active.winner)?.name} buzzed first.`
          : s?.phase === "buzzOpen"
            ? "Buzzers scheduled. Follow the countdown."
            : s?.paused
              ? "Game paused."
              : ""}
      </span>
    </>
  );
}
export default function App() {
  const [entry, setEntry] = useState(null),
    [rules, setRules] = useState(false),
    [prefs, setPrefs] = useState(false),
    [muted, setMuted] = useState(
      () => localStorage.getItem("afterhours:mute") !== "false",
    ),
    [reduced, setReduced] = useState(
      () =>
        localStorage.getItem("afterhours:motion") === "reduced" ||
        (localStorage.getItem("afterhours:motion") === null &&
          matchMedia("(prefers-reduced-motion: reduce)").matches),
    );
  useEffect(() => {
    document.documentElement.dataset.theme = "neon";
  }, []);
  useEffect(() => {
    const resume = () => {
      if (!audioSettings().muted) unlockAudio();
    };
    window.addEventListener("pointerdown", resume, { passive: true });
    window.addEventListener("keydown", resume);
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
  }, []);
  const match = location.pathname.match(/^\/room\/([a-zA-Z0-9]{6})\/?$/),
    code = match?.[1].toUpperCase(),
    display = new URLSearchParams(location.search).has("display");
  useEffect(() => {
    localStorage.setItem("afterhours:mute", String(muted));
    syncAudio();
  }, [muted]);
  useEffect(() => {
    localStorage.setItem("afterhours:motion", reduced ? "reduced" : "full");
    document.documentElement.classList.toggle("reduced-motion", reduced);
  }, [reduced]);
  useEffect(() => {
    const update = () =>
      setMuted(localStorage.getItem("afterhours:mute") !== "false");
    window.addEventListener("afterhours-audio", update);
    return () => window.removeEventListener("afterhours-audio", update);
  }, []);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to game
      </a>
      <header className="site-header">
        <Logo />
        <div className="header-right">
          {!code && (
            <span className="header-tag">GOOD COMPANY. GREAT COMPETITION.</span>
          )}
          <button
            className="header-help"
            aria-label="How to play"
            onClick={() => setRules(true)}
          >
            <HelpCircle size={16} />
            <span>How to play</span>
          </button>
          {code && (
            <IconButton
              label="Toggle full screen"
              onClick={() =>
                document.fullscreenElement
                  ? document.exitFullscreen?.()
                  : document.documentElement.requestFullscreen?.()
              }
            >
              <Expand size={17} />
            </IconButton>
          )}
          <IconButton
            label={muted ? "Enable game sounds" : "Mute game sounds"}
            onClick={() => {
              unlockAudio();
              setMuted((v) => !v);
            }}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </IconButton>
          <IconButton
            label="Sound and motion settings"
            onClick={() => setPrefs(true)}
          >
            <Settings2 size={18} />
          </IconButton>
          {!code && (
            <Button variant="header-join" onClick={() => setEntry("join")}>
              Join a room <ArrowUpRight size={15} />
            </Button>
          )}
        </div>
      </header>
      <div
        id="main-content"
        className={
          code
            ? "room-main" + (display ? " shared-display" : "")
            : "lounge-main"
        }
        tabIndex={-1}
      >
        {code ? (
          <Room code={code} display={display} reduced={reduced} />
        ) : (
          <Landing
            reduced={reduced}
            showEntry={setEntry}
            showRules={() => setRules(true)}
          />
        )}
      </div>
      {entry && <Entry kind={entry} onClose={() => setEntry(null)} />}{" "}
      {rules && <Rules onClose={() => setRules(false)} />}{" "}
      {prefs && (
        <Preferences
          onClose={() => setPrefs(false)}
          muted={muted}
          setMuted={setMuted}
          reduced={reduced}
          setReduced={setReduced}
        />
      )}
    </>
  );
}
