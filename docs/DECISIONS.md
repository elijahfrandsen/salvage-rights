# Implementation decisions

- Kept the specified Node/Socket.IO architecture. Built-in Sites hosting uses Cloudflare Worker output and cannot host this continuous Node process as-is. No static preview is presented as live multiplayer. A compatible hosting account remains necessary for public launch.
- npm workspaces are present; dependencies live in the root for a simple install. Shared imports remain relative and compiled server files retain the same directory structure. Production runs compiled JavaScript without tsx/Vite.
- Deadline ownership uses one bounded server sweep, not per-room timer closures. Injected clocks and timings make races testable; production clients cannot set timers.
- Rules resolve once before reveal animation. The UI presents absolute authoritative totals and does not add animation rewards into its own score state.
- Full small snapshots replace fragile patch/replay recovery. Removed repeated broadcast passes after load testing; only meaningful mutations broadcast.
- A native HTML dialog gives keyboard trapping and Escape support. No extra UI framework is needed.
- Vite tree shaking is disabled because Rollup’s optimization of the initial nested game rendering hung in this environment. Output is still minified (~256KiB JavaScript, ~81KiB gzip). This bounded size is acceptable for prototype launch; split App screen components and re-enable optimization later if needed.
- Original SVG/CSS art follows the explicit brief. System fonts and procedural opt-in audio require no external assets.
- Optional practice mode, analytics SDK, accolades, abilities and progression were omitted. No fake human playtests are claimed. Policy simulations diagnose economy only.
- Prototype name remains Salvage Rights. A known RPG Rights/Rites naming collision requires a broader search before promotion. No domain was purchased and no legal clearance is claimed.
