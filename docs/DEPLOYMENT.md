# Deployment

## Cloudflare: frontend and game server together

Requirements: Node.js 24+, `npm ci`, and your own Cloudflare account with Workers and SQLite-backed Durable Objects available. Check current [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/). A Free-plan deployment is quota-limited; there is no unlimited-use promise.

1. Run `npx wrangler login` and sign in in your browser.
2. Review `wrangler.jsonc`. Change the Worker `name` for your deployment if needed. Keep the Durable Object class names and SQLite migration. Leave `ALLOWED_ORIGIN` empty for same-origin hosting.
3. Run `npm run check:cloud` to verify bundling, then `npm run deploy`.
4. Open the printed HTTPS URL, create a room, import your own CSV/JSON question pack and invite friends.

Wrangler provisions the `ROOMS` and `GATES` bindings using the included migration. Normal redeployments preserve room state. Do not remove migrations or rename deployed Durable Object classes without planning a migration.

The public repository contains no question library. No secret or library download is performed during build/deployment. Hosts import packs after creating a room. Those packs live in that room's private state until expiry and are never committed to this repository automatically.

Credentials belong in Wrangler's credential store or your CI secret store. Never commit `.env`, `.dev.vars`, `.wrangler-config`, room databases or downloaded packs. This repository's CI checks code only; it has no production deployment tokens or automatic deployment step.

## Optional Netlify frontend

The persistent WebSocket backend still runs on Cloudflare. Netlify serves only the React build.

1. Deploy the Cloudflare backend as above.
2. Connect this repository to Netlify. `netlify.toml` builds `dist/` using Node 24.
3. Set Netlify's public build-time `VITE_API_URL` to the exact Worker origin, with no trailing slash.
4. Set the Worker's `ALLOWED_ORIGIN` to the exact production Netlify origin and redeploy the Worker.
5. Use that Netlify origin consistently for host/player sessions and invites. Browser capabilities are origin-specific; preview domains are not automatically allowed.

`VITE_API_URL` is a public URL, never a secret. Netlify Functions are not a replacement for this WebSocket authority.

## Node with a persistent disk

```sh
npm ci
npm run build
NODE_ENV=production APP_ORIGIN=https://game.example npm start
```

Set an exact HTTPS `APP_ORIGIN` and put the process behind an HTTPS reverse proxy. Use `TRUST_PROXY=1` only with exactly one trusted proxy. Run **one process and one replica** per database; the Node cache/socket registry is not distributed. Mount persistent storage at `DB_PATH`.

The included Dockerfile builds the client and runs Node as a non-root user:

```sh
docker build -t afterhours .
docker run --rm -p 3000:3000 \
  -e APP_ORIGIN=https://game.example \
  -v afterhours-data:/app/data afterhours
```

Terminate TLS at your reverse proxy and use the same origin for everyone. An ephemeral filesystem loses rooms on restart. A successful JavaScript build does not verify Docker availability, TLS setup or a provider's account quotas.
