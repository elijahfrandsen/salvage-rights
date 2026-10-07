# Deploy and maintain

**Deployment in progress 2026-10-07:** Source is now published at https://github.com/elijahfrandsen/salvage-rights. The Render free Web Service is https://salvage-rights.onrender.com in Oregon, with one instance. Initial build omitted development tools because NODE_ENV=production; NPM_CONFIG_INCLUDE=dev is now configured. Public acceptance checks are pending.

## Render: simplest friend-play route

1. Create or use a Render account and a GitHub/GitLab repository you control. Put the contents of this `salvage-rights` folder at the repository root and push it.
2. In Render select **New → Web Service**, connect that repository, and use Node runtime. The included `render.yaml` also supports a Blueprint deployment.
3. Build command: `npm ci --include=dev --no-audit --no-fund && npm run build`.
4. Start command: `npm start`.
5. Node version: `24.19.0`. Set `NODE_ENV=production`. Health path: `/healthz`. Render supplies `PORT`; do not hardcode a different public socket port.
6. Keep exactly **one instance**, one process, and autoscaling disabled. No Redis/database/static service is needed.
7. The assigned `onrender.com` origin is used automatically from `RENDER_EXTERNAL_URL`. For a custom domain or explicit origins set `PUBLIC_ORIGIN=https://your-real-domain.example`, without trailing slash. A comma-separated list is supported when deliberately serving multiple approved origins.
8. Choose the free compute plan for zero-subscription-cost prototype testing, or personally approve a paid always-on plan. Never treat workspace plan price as the web-service compute price.
9. Deploy, wait for the health check to succeed, then open the assigned HTTPS URL. Copy its real game link from the lobby. Do not share localhost.

No hosting account, subscription, domain purchase, paid plan, or public deployment was created by this build.

## Cost and availability

Render’s official documentation currently allows free Web Services for hobby/preview testing, with 750 free instance-hours shared per workspace per calendar month. Free services spin down after 15 minutes without inbound HTTP/WebSocket traffic and typically take about a minute to spin up again. Usage limits, possible suspension/overage billing, and restarts apply. Render advises against using this tier for production applications.

The supplied Blueprint selects Free, so expected compute subscription cost is $0 while eligible and within limits. It is not a guarantee against every possible account charge: review bandwidth/build quotas, payment settings and spending limits on your own account. A paid always-on service is preferable for reliable scheduled friend games. The exact current paid compute price was not reliably exposed by the retrieved pricing page, so confirm it in the service creation screen before accepting any charge.

Official references checked: [WebSockets](https://render.com/docs/websocket), [Web Services](https://render.com/docs/web-services), [Free service limits](https://render.com/docs/free), [pricing](https://render.com/pricing), [Node version](https://render.com/docs/node-version). Recheck them at deployment time.

## Public smoke test after deployment

These checks remain unperformed until hosting is connected:

- Open the real HTTPS game in two independent browsers. Create/join via link, refresh the `/room/CODE` URL directly, ready, launch, and finish eight rounds.
- In browser developer tools confirm `/socket.io` upgrades to **WebSocket / 101** using secure WSS. Polling working alone does not verify WSS.
- Lock a distinctive plan in one browser and confirm the rival sees only a locked indicator until reveal. Reload the locked browser; it must keep its seat and plan.
- Complete results and rematch, verify fresh sites/state, then temporarily disconnect the host and verify migration.
- Test a narrow phone. Confirm the lock bar and all three site controls remain reachable.
- Check `/healthz` gives only `{ok:true}`; requests with a forbidden Origin must fail. Confirm logs contain no bids, tokens, names or raw command bodies.
- Restart once outside a friend game: the old room must end clearly, and a new crew must work. Inspect root/share metadata and `/social.png`.

## Alternative host / Docker

The Dockerfile builds frontend and server into one runtime image and runs as an unprivileged user:

```sh
docker build -t salvage-rights .
docker run --rm -p 3000:3000 -e NODE_ENV=development salvage-rights
```

Use HTTPS termination on a public host and set `NODE_ENV=production` plus `PUBLIC_ORIGIN` to its real HTTPS address. Bindings, Docker image creation and public TLS were not tested in this environment because Docker is unavailable. The npm production build/start path was tested directly.

Railway or another always-on Node host can use the same build/start commands, platform PORT, health check, one replica, HTTPS and WSS. Set PUBLIC_ORIGIN before accepting browser connections. Do not run this server in a request-scoped function or host only `dist/client`.

## Updates, rollback, recovery

Change source → run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` → push → deploy outside active games. Restore a previously verified commit/deployment to roll back. View sanitized startup/error messages in provider logs. All active rooms disappear on every process restart/redeploy; persistent recovery is intentionally absent.

To close new rooms for maintenance, stop the service between games or change the entrypoint’s service.accepting flag in a planned release. SIGTERM immediately stops new-room acceptance, warns sockets, and closes the service cleanly. This prototype has no public admin endpoint and no secret maintenance toggle embedded in the client.

Rate limits currently key off the transport peer, not unverified forwarded headers. Verify the provider’s proxy/address behavior before wider traffic; shared proxy ingress may aggregate multiple users into one quota. Never add `trust proxy: true` without a verified hop/IP policy. Load results with locally disabled application limits do not remove this production concern.
