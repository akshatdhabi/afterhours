# Authority and deployment

## One engine, two transports

The synchronous state machine in server/game.js validates phase, session role, host revision, wager ownership, wager bounds, timers, clue window and receipt ID before accepting an action. Its tick function advances expired deadlines. Its view function creates a separate safe projection for each session.

The recommended production transport in worker/index.js maps each cryptographically generated six-character code to one **SQLite-backed Durable Object**. Mutations are serialized, cloned, validated, written durably, and then broadcast. Persistence completes before acknowledgement. Exceptions are caught inside the concurrency boundary so routine rejected actions do not reset the object or disconnect all players.

Hibernating WebSockets and serialized attachments preserve connections across sleep. Automatic heartbeat replies do not wake the object. Alarms are scheduled only for a live deadline, unauthenticated socket timeout, or room expiry; there is no polling loop. On wake, persistent state and connection attachments restore the authority. Personalized projections are sent on actions and presence changes. A fresh view contains server time for a visual countdown; server time alone decides whether actions are timely.

The local and self-hosted Node transport uses Express, ws and Node's built-in SQLite. It clones state inside a synchronous SQLite transaction, commits before broadcasting, enables WAL, and uses a bounded room cache. **Run exactly one Node process/replica per database.** Its cache and socket registry are not distributed. Multiple Node processes, cluster mode, or autoscaling require redesigning the authority. The Cloudflare path already supports independent rooms with one authority per room.

## Multiple-choice authority and the 2D client

Every selected clue projection supplies four opaque positional option IDs and display strings. Only the server retains the correct mapping. A normal answer must come from the winning buzzer's session, with the current clue window before its deadline. The server resolves the selected option and computes correctness, ignoring client claims about correctness or score. A host can still adjudicate spoken/disputed answers manually.

Final selections are stored privately by side and graded only after answers lock. Results remain private until host review/reveal. Host corrections can change final judgements before the one-time scoring transition.

The native React interface submits validated intentions and has no scoring authority. This public edition has no bundled question collection. Blank templates contain no keys; the host imports a CSV or JSON pack, validated by the shared schema. A blank pack cannot start. Imported questions stay in room state; guest projections expose no unused clues, answer keys or internal session data. Rematches reuse the imported pack with shuffled choices.

## Buzzer arbitration

The server gives each new buzz window a random UUID. Every buzz must carry that exact current UUID. First valid arrival changes the phase synchronously before the next action can be considered. Later arrivals fail. A wrong answer creates a new UUID for rebounds, so a delayed packet from the prior window cannot win. Client timestamps are ignored. Internet latency affects arrival order.

Host actions include an expected revision, preventing double scoring and decisions based on an obsolete winner. Every command has a UUID; the most recent 256 accepted session/command pairs are retained for idempotency. Scoring operations also have phase/revision guards, so eviction of an old receipt does not make an old scoring command valid. Commands awaiting acknowledgement are not automatically re-sent by reconnecting clients.

## Privacy and session security

- Tokens contain 32 random bytes. Only SHA-256 digests are stored in room state. They are bearer capabilities and should be treated as secrets.
- Invite links contain only a room code. The host's token never appears in shared links or QR codes. The display uses an independent spectator token, even on the host's browser.
- Authoritative scores, timers, used clue IDs, turn control and submissions live on the server. Clients submit intentions, never replacement room state or new scores.
- Before play, clients receive clue IDs and values only. Hidden doubles, unused questions, answer keys, internal sessions, hashes and receipts are not broadcast. During play only the selected clue is sent; its answer goes only to the host until reveal.
- Final entries are projected per side. Host sees completion flags until final review. Other sides receive flags only until results are revealed. Teammates can see their shared wager and submitted answer.
- Pack export is host-authenticated. Import is schema-validated for size, one board, six categories, five clues per category, unique safe IDs, bounded strings/values and one Daily Double (legacy two-board imports are validated, then reduced to the first board). React renders authored content as plain text; no HTML injection.
- Same-origin by default. The Worker permits one additional exact ALLOWED_ORIGIN for Netlify, including socket origin validation and API CORS. API requests are uncached. CSP blocks external scripts; no analytics, external fonts or remote images are used.
- Durable per-IP rate gates limit creates (8/hour), joins (30/minute), socket handshakes (50/minute), and pack export (20/minute). IP addresses are hashed before forming gate IDs; gate contents contain only counters and expiration timestamps. Gates expire via alarms. Authenticated sessions are limited to 180 actions per 10 seconds. Room session and connection caps bound accidental floods.
- Deployments require HTTPS. Local HTTP supports same-Wi-Fi games. Tokens in localStorage are accessible to same-origin scripts, so protect this origin and do not add untrusted scripts. No app can protect a capability after its browser/device is compromised.

These controls suit a private hobby game; they do not constitute a formal security audit or a public anti-abuse guarantee. Public room creation can consume free quotas if the URL becomes popular or is attacked. Keep the deployment among friends; account limits remain the outer boundary.

## Failure modes

A disconnected host does not invalidate a game. Timers remain authoritative and may close clues while the host reconnects. Pending client actions show a timeout and reconnect after six seconds rather than pretending they succeeded. Refresh restores the canonical snapshot. Cloudflare runtime restarts restore SQLite room data and capability digests. Timers use absolute deadlines and resume correctly after waking. Room expiry removes state and makes subsequent joins fail.

An unsubmitted final answer is null. The host sees “No answer submitted” and should mark it incorrect. A missing final wager can be explicitly defaulted by the host to zero. Daily Double wagers can be submitted by the host on behalf of the selecting player.

Room data deliberately expires. Blank templates and exported custom JSON are reusable. Never commit runtime SQLite files or session storage. Cloudflare SQLite persists normal deployments, but the application does not provide long-term score archives.

## Verification boundary

A Vite build and Wrangler deployment dry-run verify compilation and bindings, not account ownership, internet latency, quota eligibility, or an actual public rollout. The cloud test harness runs the real workerd runtime locally, including persistence across a complete restart. The demo is deployed separately from this repository; pushing code does not automatically publish it. Physical phone/TV performance is not certified by these automated tests.

## Synchronized opening

The server prepares a fresh nonce and records connected eligible player IDs from server-owned socket presence. Each client takes multiple authenticated clock round trips, uses a midpoint offset from the least-delayed recent sample, then confirms readiness. Once all expected IDs confirm, the server persists a GO time three seconds ahead and a closing deadline. Duplicate confirmations after GO are idempotent and cannot postpone it. The buzz command checks server time against both bounds; client clocks never determine score or acceptance. Hidden tabs do not acknowledge until they return. If readiness stalls, the server returns to reading after 12 seconds. This reduces unequal rendering of the opening signal, but cannot make asymmetric or stalled networks perfectly fair.

## Single-board control

The room persists selectorId (the actual player) alongside control (the scoring side). Start assigns the first seat; a correct answer updates both. Selection checks authenticated player ID, phase, pause state, revision and unused clue status. The host can explicitly reassign selectorId; implicit host selection is allowed only when no authenticated selector session is connected. A selected Daily Double persists ownerPlayerId, and only that player (or the host wager fallback) can wager; its answer winner is that same player. Final still uses the first-listed teammate for one private submission per side.

Rules version 3 reduces legacy rooms to their current board, preserving an in-flight clue, scores, Final entries and guest sessions. nextRound is a compatibility alias for finalBegin. New custom packs and the classic pack have one board; valid old two-board imports use their first board.
