import { createGameServer } from "../dist/apps/server/src/http.js";
// Short timings are injected only by this development test entrypoint; clients cannot configure them.
const game = createGameServer({
  origin: "http://127.0.0.1:3100",
  timing:
    process.env.E2E_NORMAL === "1"
      ? undefined
      : {
          starting: 500,
          firstPlanning: 15000,
          planning: 12000,
          minimumPlanning: 1800,
          reveal: 2200,
          summary: 600,
        },
});
game.http.listen(3100, "127.0.0.1");
process.on("SIGTERM", () => void game.close());
