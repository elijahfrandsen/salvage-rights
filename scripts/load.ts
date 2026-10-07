import { createGameServer } from "../apps/server/src/http.js";
import { io, type Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import type { Ack, Envelope } from "../packages/shared/src/types.js";
const rooms = Number(process.env.LOAD_ROOMS ?? 50),
  size = 6;
const timing = {
  starting: 200,
  firstPlanning: 8000,
  planning: 8000,
  minimumPlanning: 300,
  reveal: 150,
  summary: 100,
};
const game = createGameServer({ timing, limits: false });
await new Promise<void>((r) => game.http.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${(game.http.address() as any).port}`;
const clients: Socket[] = [];
const ackTimes: number[] = [];
let errors = 0,
  maxSnapshot = 0;
const completed = new Set<string>();
const initial = process.memoryUsage().rss;
const cpu = process.cpuUsage(),
  start = performance.now();
const delay = monitorEventLoopDelay({ resolution: 10 });
delay.enable();
function command(s: Socket, event: string, data: object = {}): Promise<Ack> {
  const t = performance.now();
  return new Promise((resolve) =>
    s
      .timeout(10000)
      .emit(
        event,
        { requestId: randomUUID(), ...data },
        (err: Error | null, ack: Ack) => {
          ackTimes.push(performance.now() - t);
          if (err || !ack?.ok) errors++;
          resolve(ack);
        },
      ),
  );
}
async function connect() {
  const s = io(url, {
    forceNew: true,
    transports: ["websocket"],
    reconnection: false,
  });
  clients.push(s);
  await new Promise<void>((resolve, reject) => {
    s.once("connect", resolve);
    s.once("connect_error", reject);
  });
  return s;
}
const groups: Socket[][] = [];
for (let r = 0; r < rooms; r++) {
  const a = await connect();
  const created = await command(a, "room:create", {
    name: "Captain0",
    shipId: "tug",
  });
  if (!created.ok) throw new Error("Create failed");
  const group = [a];
  for (let p = 1; p < size; p++) {
    const s = await connect();
    await command(s, "room:join", {
      name: `Captain${p}`,
      shipId: "courier",
      code: created.data!.code,
    });
    group.push(s);
  }
  groups.push(group);
  for (const s of group) {
    const seen = new Set<string>();
    s.on("state:update", (e: Envelope) => {
      maxSnapshot = Math.max(maxSnapshot, Buffer.byteLength(JSON.stringify(e)));
      if (e.public.phase === "RESULTS") completed.add(e.public.code);
      if (
        e.public.phase === "PLANNING" &&
        !seen.has(e.public.match!.roundId!)
      ) {
        seen.add(e.public.match!.roundId!);
        void command(s, "round:submit", {
          matchId: e.public.match!.id,
          roundId: e.public.match!.roundId,
          bids: e.public.match!.sites.map((site) => ({
            siteId: site.id,
            drones: 0,
          })),
        });
      }
    });
    await command(s, "player:ready", { ready: true });
  }
}
const peak = process.memoryUsage().rss;
await Promise.all(groups.map((group) => command(group[0], "game:start")));
const timeout = performance.now() + 30000;
while (completed.size < rooms && performance.now() < timeout)
  await new Promise((r) => setTimeout(r, 100));
const afterMatches = process.memoryUsage().rss;
for (const s of clients) await command(s, "room:leave");
clients.forEach((s) => s.disconnect());
await new Promise((r) => setTimeout(r, 100));
delay.disable();
ackTimes.sort((a, b) => a - b);
const used = process.cpuUsage(cpu);
const report = {
  date: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  rooms,
  clients: size * rooms,
  normalMatchesCompleted: completed.size,
  transport: "websocket (local WS, not public WSS)",
  elapsedMs: Math.round(performance.now() - start),
  cpuMs: Math.round((used.user + used.system) / 1000),
  acknowledgements: ackTimes.length,
  ackP50Ms: +ackTimes[Math.floor(ackTimes.length * 0.5)].toFixed(2),
  ackP95Ms: +ackTimes[Math.floor(ackTimes.length * 0.95)].toFixed(2),
  maxSnapshotBytes: maxSnapshot,
  eventLoopP95Ms: +(delay.percentile(95) / 1e6).toFixed(2),
  rssMiB: {
    initial: Math.round(initial / 1048576),
    connected: Math.round(peak / 1048576),
    afterMatches: Math.round(afterMatches / 1048576),
    afterCleanup: Math.round(process.memoryUsage().rss / 1048576),
  },
  roomsAfterCleanup: game.service.rooms.size,
  transportOrCommandErrors: errors,
};
writeFileSync("artifacts/load-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await game.close();
if (completed.size !== rooms || errors || report.roomsAfterCleanup)
  process.exitCode = 1;
