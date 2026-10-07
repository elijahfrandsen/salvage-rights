# Salvage Rights

A real private-room multiplayer strategy game for 2–6 friends. Split your power between three wrecks, lock secret bids, reveal together, and compete for credits over eight rounds. Every drone costs power, even when you lose.

**Play publicly:** https://salvage-rights.onrender.com

Hosted on Render Free in Oregon. Create a room and share its invite with 2–6 friends. The service may take about a minute to wake after inactivity. Restarting or redeploying ends active rooms.

## Play on your computer

1. Install Node.js 24 LTS (tested with 24.19.0).
2. Extract this folder and open a terminal inside `salvage-rights`.
3. Run:

```sh
npm ci
npm run build
npm start
```

4. Open `http://localhost:3000` in your browser. Create a room and copy its invite link. For local testing, use a separate browser profile or an incognito window to join as another captain.

For friends on the internet, deploy first using [the deployment guide](docs/DEPLOYMENT.md). A localhost link works only on your own computer.

Names and cosmetic preferences stay on the device. Your anonymous seat token stays in the current tab’s session storage, so refreshing resumes the same seat. If you intentionally move a session to a different connection, the old connection loses control. There are no accounts.

## Commands

| Command                           | Purpose                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| `npm run dev`                     | Node server on 3000 and Vite UI on 5173                            |
| `npm run build`                   | Compile server/shared code and build the frontend                  |
| `npm start`                       | Serve the compiled game and sockets together on 3000               |
| `npm run typecheck`               | Check all TypeScript                                               |
| `npm run lint`                    | Check formatting with Prettier                                     |
| `npm test`                        | Rules, deterministic clock/controller, and real socket tests       |
| `npx playwright install chromium` | Install the browser needed for UI tests                            |
| `npm run test:e2e`                | Two isolated browsers, full match/rematch and mobile checks        |
| `E2E_NORMAL=1 npm run test:e2e`   | Repeat browser acceptance with normal game timers on macOS/Linux   |
| `npm run load`                    | Local 50-room / 300-client benchmark; never aims at a public host  |
| `npm run balance`                 | Diagnostic policies for 2, 4, and 6 players; not human playtesting |

On Windows PowerShell, set `$env:E2E_NORMAL='1'` before the normal-timing test, and remove it afterward using `Remove-Item Env:E2E_NORMAL`.

## Play

Create a room, choose a callsign and cosmetic ship, and invite friends with the link or code. Everyone marks ready. The host launches. Allocate 0–8 drones per wreck and lock before the countdown ends. Rivals cannot see your bids until reveal. On a tie, top bidders split base credits, rounded down. Passing is legal. Missing two consecutive deadlines forfeits the match; locking a deliberate zero plan counts as participating.

Eight rounds determine the highest score; equal top totals share victory. Use “Ready for rematch,” then the host returns the crew to the lobby. Re-ready and launch. Refreshing or briefly disconnecting never creates an extra seat.

## Limits and maintenance

One Node process and one instance are required. Rooms are in memory: restarting or redeploying ends sessions. Avoid deploying during friend games. Lobby seats are reserved for 60 seconds disconnected; match seats for 90 seconds. Codes are convenient invites, not a security boundary against people who know the code.

Core settings are in `packages/shared/src/config.ts`; content is in `sites.ts`. Update help copy and tests if rules change. Original artwork is in `apps/client/src/Art.tsx`; no external art or font service is required. Sounds are opt-in and generated locally.

See [rules](docs/RULES.md), [architecture](docs/ARCHITECTURE.md), [test report](docs/TEST_REPORT.md), [deployment](docs/DEPLOYMENT.md), and [playtest plan](docs/PLAYTEST.md). Raw test screenshots and diagnostics are included in `artifacts/` in the handoff archive.
