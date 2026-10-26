# Security

Please do not put exploitable vulnerabilities or live credentials in public issues. Use the repository's **Security → Report a vulnerability** option for a private report. For ordinary UI bugs and disputed trivia, use an issue with synthetic examples.

Include the affected version, reproduction steps, expected behavior and impact. Do not include production session tokens, authorization links, private question packs or player information. No response-time guarantee or bug bounty is offered.

## Security model

- The server authorizes actions and computes scores. Browser-reported scores and tap timestamps are not trusted.
- Host/player/spectator sessions use random bearer capabilities; only their digests are stored in room state. Invite URLs carry room codes, not host tokens.
- Room codes permit lobby joining or spectating. Keep them within your group; they are not passwords.
- Final submissions remain private until reveal. A playing host has access to answer keys for adjudication, so use a separate host for competitive play.
- HTTPS, exact-origin checks, request validation, rate limits and room expiry bound the hobby deployment. They are not a formal security audit or a guarantee against quota exhaustion.
- Local browser storage holds session capabilities. Clearing it loses that browser's recovery path. Avoid adding untrusted scripts to the deployment origin.

The app requires no runtime API keys. Keep deployment credentials in the CLI's credential store or a hosting secret store, never in source or public build-time variables. See [architecture](docs/ARCHITECTURE.md) for the complete trust boundary.
