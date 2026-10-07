import { createGameServer } from "./http.js";
const game = createGameServer();
const port = Number(process.env.PORT ?? 3000);
game.http.listen(port, "0.0.0.0", () =>
  console.log(JSON.stringify({ event: "server_started", port })),
);
let closing = false;
const stop = () => {
  if (closing) return;
  closing = true;
  game.close().then(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
