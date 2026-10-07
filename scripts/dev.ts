import { spawn } from "node:child_process";
const children = [
  spawn("node", ["--watch", "--import", "tsx", "apps/server/src/index.ts"], {
    stdio: "inherit",
  }),
  spawn("npx", ["vite", "--config", "apps/client/vite.config.ts"], {
    stdio: "inherit",
  }),
];
const close = () => children.forEach((c) => c.kill());
process.on("SIGTERM", close);
process.on("SIGINT", close);
