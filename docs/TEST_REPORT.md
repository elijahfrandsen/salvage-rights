# Verification report — 2026-10-07

## Verified locally

- Node v24.19.0, npm 11.9.0, Linux x64.
- TypeScript typecheck and Prettier checks pass.
- Production build passes: ~256KiB JavaScript / ~81KiB gzip, ~17KiB CSS / ~4KiB gzip.
- **34 Vitest tests pass:** 12 rules/content, 13 injected-clock/controller, 9 real Socket.IO network tests.
- Rules include worked examples, 300 deck seeds and 1,000 randomized allocation invariants, ties, thresholds, double power, bonuses, recharge/cap/final round, forfeits, immutability and ordering independence.
- Clock/controller checks cover minimum reveal, deadline boundary, exactly-once settlement, AFK cancellation, intentional zero resets, forfeit cost/reward, stale socket disconnect, privacy projection, grace/idle cleanup, normal final victory and fresh rematch seed, and readiness reset after roster departure.
- Real clients complete a six-player eight-round match and rematch. Captured planning messages exclude rivals’ request fingerprints/private bids. Transport is actual local WebSocket. Twenty concurrent rooms remain isolated.
- Negative/fractional/overspent/missing/duplicate/unknown-site/stale-round/spoofed-player submissions fail without mutating locks/power. Wrong tokens, unknown rooms, host spoofing, malformed names, full/mid-match join, origin rejection, create rate limits, request replay/change rejection and oversized message disconnect are checked.
- Development UI and health proxy start successfully after adapting its bind address to this environment.
- Compiled production HTTP smoke checks pass: root/share-route HTML, absolute social metadata, PNG, health, forbidden polling Origin, real WebSocket room creation.
- A separate clean `npm ci --omit=dev` installation with the compiled build passes that smoke check without Vite/tsx/TypeScript runtime dependencies.
- Production dependency audit retrieved zero reported vulnerabilities at check time. This is not a guarantee against undisclosed vulnerabilities.

## Browser acceptance

The browser suite uses genuinely independent Chromium contexts with the actual server, not UI socket mocks. Screenshots cover desktop and mobile lobby, planning, reveal and results.

Accelerated testing verifies a full eight-round match, nonzero drone orders and displayed credits, shared victory, accepted-lock refresh, host migration, fresh rematch, mobile keyboard controls, reduced motion, direct-link entry and viewport overflow checks at 360×800, 390×844, 768×1024 and 1440×900. Page exceptions are collected in the full-match test. Final accelerated suite: **2 tests passed in 51.1 seconds**. The full match used nonzero bids and verified positive, equal displayed final scores before starting a fresh rematch.

A separate normal-timing compiled-server run completed all eight rounds and started a rematch in about 3.2 minutes with deliberate passes producing a shared victory. The separate normal-timing mobile check passed in 15.7 seconds (17.7 seconds including startup). Early test failures exposed stale host assumptions, a dialog-dismissal timing race in the harness, reveal windows too short for polling assertions, and a five-second test timeout shorter than the actual ten-second minimum planning period. These test harness issues were corrected. Concurrent output collisions were resolved by giving normal and accelerated runs separate report directories. Product fixes included abandoned-room cleanup, readiness reset on roster removal, and unnecessary duplicate broadcasts.

The final UI exposes all claim numbers together at reveal; only site award highlighting is staged. Visual inspection found legible desktop/mobile planning controls and game-specific artwork. Mobile sticky controls overlay the viewport bottom while scrolling, with normal document space below the cards; they remain reachable.

## Local load diagnostic

50 rooms × 6 clients = 300 local WebSocket connections, each completing eight rounds with legitimate zero locks. Application IP/session limits are deliberately disabled in the isolated harness. The process also runs the clients, so this is not a production SLA or a clean server-only benchmark.

| Measurement                               |           Observed |
| ----------------------------------------- | -----------------: |
| Completed normal matches                  |            50 / 50 |
| Total elapsed                             |           8,165 ms |
| CPU time                                  |           6,858 ms |
| Acknowledgement p50                       |          150.25 ms |
| Acknowledgement p95                       |          382.31 ms |
| Largest snapshot                          |        7,447 bytes |
| Event-loop delay p95                      |           67.44 ms |
| RSS initially / connected / after matches | 94 / 120 / 261 MiB |
| RSS after cleanup                         |            260 MiB |
| Rooms after explicit leave cleanup        |                  0 |
| Transport/command errors                  |                  0 |

The local p95 target of 250ms was **not met at this saturated load**. Removing duplicate broadcasts improved it from an earlier ~779ms run. Memory was not forced through GC, so remaining RSS does not establish a retained-room leak or a steady-state memory bound. Do not claim 300 clients are an operational guarantee. Keep the initial room cap and begin with small friend sessions. Raw JSON is in `artifacts/load-report.json`.

## Balance diagnostics

Five simple policies across 300 seeds each for 2, 4, and 6 players use only current public sites and previous revealed results, never secret locks/future decks. Six-player scenarios had ~39.6% tied sites and ~36.3% zero-credit player-rounds. Outcomes vary with the policies and seating mix; simulations do not demonstrate fun, human strategy, or rematch willingness. No launch rule values were changed on this evidence alone.

## Not verified / launch blockers

- No public deployment, public HTTPS/WSS upgrade, live-origin checks, provider restart, or public-browser acceptance. Compatible hosting access is missing.
- No Docker runtime build (Docker is unavailable), physical phone or Safari/Firefox run.
- No human 2/4/6-player playtest or real rematch-conversion analytics.
- UI rejected-plan preservation is implemented; adversarial rejections are primarily exercised through real socket tests, not a browser-forced server rejection.
- No exhaustive accessibility audit or provider-specific trusted proxy policy. The source documents peer-based throttling at a proxy boundary.
- Optional practice mode, durable metrics and future abilities remain absent.

The correct status is **tested local multiplayer game, public launch pending hosting access**. A screenshot, localhost address or static-only page is not a public multiplayer launch.
