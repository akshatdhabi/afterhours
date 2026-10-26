# Contributing

Use Node.js 24+ and `npm ci`. Run `npm run dev` for the local game; no cloud account or API key is needed.

Before opening a pull request:

```sh
npm run format
npm test
npm run check:cloud
npm run test:cloud
```

Keep scoring, permissions, wagers, deadlines and buzzer arbitration in `server/game.js`. Both the Node and Cloudflare transports use this engine. Test rule changes with independent clients, including a player who does not have host privileges.

Question content is separate from source. Do not commit real packs or the hosted demo collection. Use synthetic fixtures for tests; authoring/import instructions are in [QUESTION-PACKS.md](docs/QUESTION-PACKS.md).

Use synthetic names and disposable rooms in tests. Never attach live session tokens, authorization callbacks, room databases, `.env` files or Wrangler credentials to commits or issues. Report security problems through the process in [SECURITY.md](SECURITY.md).

By contributing, you agree to license your application code and original wording under the project's MIT license. Preserve notices for third-party material.
