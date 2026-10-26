# The experience

## Prepare

Create a private six-character room with two to six total players and individual scores or two/three balanced teams. The host plays from the same phone by default, or emcees separately. Join by link, code or QR, without accounts. Configure seats, team names, answer timers and ordinary wrong-answer penalties in the lobby. Import or author your own CSV/JSON question pack before starting; no questions are bundled.

Every device uses the same native 2D interface. Larger screens show all six categories; phones page through pairs with 44px previous/next controls. Category headings wrap without covering values. Raised tiles, answer cards and the buzzer have touch/keyboard press feedback. Hover is supplemental. Font sizes do not depend on WebGL, perspective or render resolution. The original cyberpunk broadcast treatment uses matching warm red column frames, cyan signals, electric yellow controls, angular signal hardware and small animated LED segments. Responsive SVG borders keep stepped corners at a fixed size around native text; the buzzer core has segmented circular rings. Played tiles retain their value with a Cleared label. Text stays steady; reduced motion removes flicker, pulses and choreography. The buzzer shows explicit standby/live states, a hexagonal reactor and immediate mechanical press feedback.

The blank pack has six categories, five values per category, one Daily Double and Final. See QUESTION-PACKS.md for CSV/JSON instructions and QUESTION-LIBRARY.md for independent sourcing. Rematches reuse the imported pack with shuffled choices.

## Read, buzz, answer

The first seat selects the opening question. The last correct answering player selects each subsequent question, including in team mode. Other players and the host cannot take that pick while the selector is connected. The host can explicitly pass control in Host controls, or pick for a disconnected selector. Everyone sees the question and four choices. The host gives the signal when the group is ready. Choices stay read-only until a buzzer winner is accepted.

Connected eligible players acknowledge readiness and clock estimates. Once all confirm, the server publishes a three-second countdown and a common future GO time. Clients render GO locally against estimated server time. A tactile CSS buzzer appears during readiness/countdown/GO, with immediate press feedback on phones and desktops. Press down or use Space; the first valid arrival at the authoritative server wins. Arbitrary network delays still affect arrival order. Early taps cannot win.

Missing readiness times out safely after 12 seconds. The host checks connections and retries. Duplicate seat tabs cannot move an existing GO timestamp. Old window IDs cannot win a rebound.

Only the accepted player can select one of the four choices. The server grades it and applies points. Default timers are 15 seconds to buzz and 10 seconds to answer, configurable from 5–30. Reading has no timer. Other players see who buzzed first and is answering. After a correct answer, that player selects the next question. A wrong answer or an unanswered clue retains the existing selector. Incorrect/timeout loses the clue value unless ordinary penalties are off, and locks the entire side out for that clue. Remaining sides get a new readiness barrier and countdown.

The wrong player's/team's verdict stays in the viewport until **Back to the game** or Escape. It includes the chosen answer, score delta and rebound explanation. The result does not pause other players or server timers. Refresh restores an undismissed result; advancing the clue clears it. Missed choices remain marked with an X and the revealed correct choice with a check. Results do not rely solely on colour.

## Daily Doubles

One hidden Daily Double appears on the sole board, randomly placed below the $200 row. The player who selects it owns the wager and answer, even when another teammate is the Final captain. Selection and score changes remain authoritative on the server.

Only that side plays the bonus. The selecting player wagers $0 up to the greater of the side's score and the board's maximum clue value. The host may submit a fallback. Clue and choices stay secret until the wager locks. The host starts the timer; the selecting player chooses the answer. Correct adds the wager; incorrect/timeout always loses it, including when normal penalties are off.

## Final and rematch

Positive-score sides privately wager $0 to their score; the host may default an absent wager to zero. After wagers lock, reveal the clue and four choices. Each side's captain submits one private choice within 45 seconds by default (15–120 configurable). Teammates see their shared locked choice; opponents and the host see submission flags until answers lock.

The server grades after lock/timeout. Host review can correct a judgement before reveal applies all wagers exactly once. Answers, wagers and results are then shown together. Ties share victory. Rematch preserves seats and draws a fresh library pack while carrying host-browser history.

## Devices and recovery

A separate spectator link supplies the same authoritative state for a TV/laptop. No hidden clues or correct option IDs reach spectators before reveal. Sounds require a user gesture per device: the original industrial synthwave score, synthesized game signals and optional low-pitched browser announcements have independent preferences and mute. The mixer ducks music beneath cues and voices, quietens reading/answering, and silences audio when the tab is hidden. Sound settings offer individual cue previews. Remote players may use their own voice call.

Opaque sessions are stored in the original browser. Refresh/reconnect restores the canonical seat, points and game state. Controls lock during disconnection, pending actions are not blindly replayed, and timers continue if the host disconnects. There is no automatic host election or account-based cross-device recovery. Late joins spectate; seats remain reserved.

Rooms expire after 12 hours by default (1–48 configurable); rematches do not extend lifetime. Cloudflare alarms delete expired state and close sockets. The Node server uses SQLite and must run as a single process per database.

The game has one 30-clue board followed directly by Final. There is no Double Stakes board. The host can advance after all 30 clues, or explicitly skip remaining clues. Old two-board rooms keep their current board and in-flight clue when migrated; already-dealt questions and scores are preserved. Rematches/new rooms draw from the expanded bank.
