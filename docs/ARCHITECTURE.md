# Architecture and operational boundaries

TypeScript + React/Vite frontend; Express/Socket.IO server; Zod command validation; shared deterministic rules. One process serves HTTP, SPA assets, and sockets. Pure rules do not depend on React or sockets.

`apps/server/src/roomService.ts` owns room/match state, eligibility, deadlines, scoring and privacy projection. `http.ts` binds sockets to anonymous identities, validates commands, caches acknowledgements and enforces limits. Mutation paths are synchronous; there is no asynchronous I/O midway through settlement.

A single 100ms bounded safety sweep advances absolute deadlines and removes expired seats/cache/rate entries. This replaces separate per-room timers, so rematches/deleted rooms cannot retain stale timeout closures. It never sends per-second timer broadcasts. Delayed ticks do not accept late orders: commands advance expired phases before validation. Clients animate from server timestamps and projected snapshots. Phase transitions after an event-loop delay start their next duration from actual transition time rather than skipping reveal information.

Public data is explicitly projected with an allowlist. Planning snapshots contain public score/start power and lock flags. Only the recipient’s own accepted allocation enters its private view. No seed, future deck, token hash, raw token, socket ID, request cache or rival bid is serialized. At reveal, public records expose bids and settlement, without request IDs or secrets. No HTTP state/debug dump exists.

Tokens are 256-bit random values stored in sessionStorage on the client and SHA-256 hashes on the server. Identity never uses names or socket IDs. Resume replaces the active socket; stale disconnect callbacks cannot disconnect a resumed seat. Host migrates immediately, resets readiness, and does not revert automatically when the original host reconnects.

UUID request IDs and bounded two-minute caches replay identical commands; changed payload under the same ID fails. Socket-level create/join results are temporarily retained on their creating connection for acknowledgement recovery; resumed sessions never receive another player’s credentials. Immutable lock and phase guards remain after cache eviction.

Rooms: 100 / 600 seated players maximum. 8KiB transport message bound; 5 creates per transport-peer IP per 10 minutes; 30 join/resume attempts per minute; 75 session commands per minute (60 baseline + 15 burst allowance); 360 connections per peer per minute. Request retries served from cache do not count twice. HTTP health exposes only `{ok:true}`.

Proxy boundary: forwarded IP headers are deliberately not trusted. Behind Render, peer-based limits can aggregate traffic at the proxy rather than identifying each user. This is conservative but can reject a busy shared ingress; configure verified provider-specific forwarding trust before a wider launch. Never blindly trust arbitrary X-Forwarded-For. A 50-room load harness disables application rate limits locally only and is not proof of that many production clients behind one ingress.

Origins are enforced for polling and WebSocket handshakes. In production, an explicit HTTPS PUBLIC_ORIGIN or Render’s assigned RENDER_EXTERNAL_URL is required; no-origin clients are rejected. The browser sends Origin normally. CSP, no-sniff, no-referrer, and anti-framing headers are served. Use the hosting platform for TLS.

Shutdown closes sockets, clears sweep and rooms and warns clients; sessions are lost. No database, durable analytics, accounts, chat, spectators, live-room bots, or automatic scaling. Anonymous invite codes are susceptible to lobby intrusion when shared publicly. One-process authority is not suitable for multiple replicas.
