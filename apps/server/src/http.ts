import express from "express";
import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import path from "node:path";
import { readFileSync } from "node:fs";
import {
  RoomService,
  GameError,
  type Room,
  type Captain,
} from "./roomService.js";
import {
  schemas,
  type Command,
} from "../../../packages/shared/src/validation.js";
import type { Ack } from "../../../packages/shared/src/types.js";
import type { Timing } from "../../../packages/shared/src/config.js";
export interface ServerOptions {
  timing?: Timing;
  origin?: string;
  production?: boolean;
  limits?: boolean;
  clientDir?: string;
}
export function createGameServer(options: ServerOptions = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    next();
  });
  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  const http = createServer(app);
  const production =
    options.production ?? process.env.NODE_ENV === "production";
  const origins = new Set(
    (
      options.origin ??
      process.env.PUBLIC_ORIGIN ??
      process.env.RENDER_EXTERNAL_URL ??
      "http://localhost:5173,http://localhost:3000,http://127.0.0.1:3000,http://127.0.0.1:5173"
    )
      .split(",")
      .map((s) => s.trim()),
  );
  if (production && [...origins].some((s) => !s.startsWith("https://")))
    throw new Error(
      "Set PUBLIC_ORIGIN to the HTTPS game origin in production.",
    );
  const io = new Server(http, {
    maxHttpBufferSize: 8192,
    serveClient: false,
    cors: { origin: [...origins] },
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, origin ? origins.has(origin) : !production);
    },
  });
  const service = new RoomService(
    Date.now,
    options.timing,
    (room) => {
      for (const p of room.players.values())
        if (p.socketId)
          io.to(p.socketId).emit("state:update", service.project(room, p.id));
    },
    (room) => {
      for (const p of room.players.values())
        if (p.socketId) {
          const s = io.sockets.sockets.get(p.socketId);
          s?.emit("server:notice", {
            code: "ROOM_EXPIRED",
            message: "This session ended. Create a new room.",
          });
          if (s) s.data.binding = undefined;
        }
    },
  );
  const rates = new Map<string, { count: number; expires: number }>();
  const rate = (key: string, limit: number, window: number) => {
    if (options.limits === false) return;
    const now = Date.now();
    let r = rates.get(key);
    if (!r || r.expires <= now) {
      r = { count: 0, expires: now + window };
      rates.set(key, r);
    }
    if (++r.count > limit)
      throw new GameError(
        "RATE_LIMIT",
        "Too many requests. Please wait a moment.",
      );
  };
  // No proxy trust: socket transport peer is the rate-limit identity. Configure provider-specific proxy handling before changing this.
  io.use((socket, next) => {
    try {
      rate("connect:" + socket.handshake.address, 360, 60000);
      next();
    } catch {
      next(new Error("Connection limit reached. Try again shortly."));
    }
  });
  io.on("connection", (socket: Socket) => {
    const unauthCache = new Map<
      string,
      { fingerprint: string; ack: Ack; expires: number }
    >();
    for (const event of Object.keys(schemas) as Command[])
      socket.on(event, (raw: unknown, callback: unknown) => {
        if (typeof callback !== "function") return;
        const ackFn = callback as (a: Ack) => void;
        let requestId = "";
        let fingerprint = "";
        let cache = unauthCache as Map<
          string,
          { fingerprint: string; ack: unknown; expires: number }
        >;
        try {
          const parsed = schemas[event].safeParse(raw);
          if (!parsed.success)
            throw new GameError(
              "INVALID_PAYLOAD",
              "Check your callsign, room code, and orders.",
            );
          const data: any = parsed.data;
          requestId = data.requestId;
          fingerprint = event + JSON.stringify(data);
          const binding = socket.data.binding as
            | { code: string; playerId: string }
            | undefined;
          let room: Room | undefined, p: Captain | undefined;
          if (binding) {
            room = service.get(binding.code);
            service.tickRoom(room);
            p = service.captain(room, binding.playerId, socket.id);
            cache = p.cache;
          }
          for (const [id, v] of cache)
            if (v.expires <= Date.now()) cache.delete(id);
          const old = cache.get(requestId);
          if (old) {
            if (old.fingerprint !== fingerprint)
              throw new GameError(
                "REQUEST_REUSED",
                "That request ID was already used for different orders.",
              );
            ackFn(old.ack as Ack);
            if (room) socket.emit("state:update", service.project(room, p!.id));
            return;
          }
          rate("command:" + (p?.id ?? socket.id), 75, 60000);
          let result: any;
          if (event === "room:create" || event === "room:join") {
            if (binding)
              throw new GameError(
                "ALREADY_SEATED",
                "Leave your current room first.",
              );
            rate(
              (event === "room:create" ? "create:" : "join:") +
                socket.handshake.address,
              event === "room:create" ? 5 : 30,
              event === "room:create" ? 600000 : 60000,
            );
            const entry =
              event === "room:create"
                ? service.create(data.name, data.shipId, socket.id)
                : service.join(data.code, data.name, data.shipId, socket.id);
            room = entry.room;
            p = entry.p;
            socket.data.binding = { code: room.code, playerId: p.id };
            result = {
              code: room.code,
              playerId: p.id,
              resumeToken: entry.token,
            };
          } else if (event === "room:resume") {
            if (binding)
              throw new GameError(
                "ALREADY_SEATED",
                "This connection is already seated.",
              );
            rate("join:" + socket.handshake.address, 30, 60000);
            const entry = service.resume(
              data.code,
              data.resumeToken,
              socket.id,
            );
            room = entry.room;
            p = entry.p;
            socket.data.binding = { code: room.code, playerId: p.id };
            if (entry.oldSocket && entry.oldSocket !== socket.id) {
              const old = io.sockets.sockets.get(entry.oldSocket);
              old?.emit("session:replaced", {
                message: "This captain is active in another tab.",
              });
              old?.disconnect(true);
            }
            result = { code: room.code, playerId: p.id };
          } else {
            if (!room || !p)
              throw new GameError("NOT_SEATED", "Join a crew first.");
            switch (event) {
              case "player:ready":
                service.ready(room, p, data.ready);
                break;
              case "player:update":
                service.update(room, p, data);
                break;
              case "game:start":
                service.start(room, p);
                break;
              case "round:submit":
                service.submit(room, p, data);
                break;
              case "game:rematch":
                service.rematch(room, p);
                break;
              case "room:leave":
                service.leave(room, p);
                socket.data.binding = undefined;
                break;
              case "time:sync":
                result = { serverNow: Date.now() };
                break;
              case "state:request":
                break;
            }
          }
          const ack: Ack = {
            ok: true,
            requestId,
            revision: room?.revision ?? 0,
            data: result,
          };
          cache.set(requestId, {
            fingerprint,
            ack,
            expires: Date.now() + 120000,
          });
          if (p && (event === "room:create" || event === "room:join"))
            p.cache.set(requestId, {
              fingerprint,
              ack: { ...ack, data: { code: room!.code, playerId: p.id } },
              expires: Date.now() + 120000,
            });
          if (cache.size > 128) cache.delete(cache.keys().next().value!);
          ackFn(ack);
          if (room && (event === "state:request" || event === "time:sync"))
            socket.emit("state:update", service.project(room, p!.id));
        } catch (error) {
          const e =
            error instanceof GameError
              ? error
              : new GameError(
                  "INTERNAL",
                  "Orders could not be processed. Please try again.",
                );
          if (!(error instanceof GameError))
            console.error(
              JSON.stringify({
                event: "command_error",
                type: (error as Error).name,
              }),
            );
          const ack: Ack = {
            ok: false,
            requestId,
            code: e.code,
            message: e.message,
          };
          if (requestId && e.code !== "REQUEST_REUSED") {
            cache.set(requestId, {
              fingerprint,
              ack,
              expires: Date.now() + 120000,
            });
            if (cache.size > 128) cache.delete(cache.keys().next().value!);
          }
          ackFn(ack);
        }
      });
    socket.on("disconnect", () => {
      const binding = socket.data.binding;
      if (binding) {
        const room = service.rooms.get(binding.code);
        if (room) service.disconnect(room, binding.playerId, socket.id);
      }
    });
  });
  const sweep = setInterval(() => {
    service.tick();
    for (const [k, r] of rates) if (r.expires <= Date.now()) rates.delete(k);
  }, 100);
  sweep.unref();
  const clientDir = options.clientDir ?? path.resolve("dist/client");
  app.use(express.static(clientDir, { index: false }));
  app.get("/social.svg", (_req, res) =>
    res.sendFile(path.join(clientDir, "social.svg")),
  );
  app.get(/^\/(?:room\/[A-Za-z2-9]{6})?$/, (req, res) => {
    const origin = [...origins][0];
    const html = readFileSync(path.join(clientDir, "index.html"), "utf8")
      .replace('content="/social.png"', `content="${origin}/social.png"`)
      .replace(
        "</head>",
        `<meta property="og:url" content="${origin}${req.path}" /></head>`,
      );
    res.type("html").send(html);
  });
  async function close() {
    clearInterval(sweep);
    service.accepting = false;
    io.emit("server:notice", {
      code: "SERVER_SHUTDOWN",
      message: "The sector is restarting. Active sessions will end.",
    });
    await new Promise<void>((resolve) => io.close(() => resolve()));
    rates.clear();
    service.rooms.clear();
  }
  return { app, http, io, service, close };
}
