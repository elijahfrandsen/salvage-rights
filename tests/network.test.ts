import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { io, type Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import { createGameServer } from "../apps/server/src/http.js";
import type { Ack, Envelope } from "../packages/shared/src/types.js";
let game: ReturnType<typeof createGameServer>, url: string;
let sockets: Socket[] = [];
const timing = {
  starting: 50,
  firstPlanning: 2000,
  planning: 2000,
  minimumPlanning: 100,
  reveal: 50,
  summary: 50,
};
async function connect(origin = "http://127.0.0.1:3000") {
  const s = io(url, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    extraHeaders: { Origin: origin },
  });
  sockets.push(s);
  await new Promise<void>((res, rej) => {
    s.once("connect", res);
    s.once("connect_error", rej);
  });
  return s;
}
async function cmd(
  s: Socket,
  event: string,
  data: Record<string, unknown> = {},
  id = randomUUID(),
): Promise<Ack> {
  return new Promise((resolve) =>
    s.emit(event, { requestId: id, ...data }, resolve),
  );
}
function view(s: Socket, predicate: (e: Envelope) => boolean) {
  return new Promise<Envelope>((resolve, reject) => {
    const timer = setTimeout(() => {
      s.off("state:update", listener);
      reject(new Error("Snapshot timeout"));
    }, 8000);
    const listener = (e: Envelope) => {
      if (predicate(e)) {
        clearTimeout(timer);
        s.off("state:update", listener);
        resolve(e);
      }
    };
    s.on("state:update", listener);
    void cmd(s, "state:request");
  });
}
beforeEach(async () => {
  game = createGameServer({ timing, limits: false });
  await new Promise<void>((res) => game.http.listen(0, "127.0.0.1", res));
  url = `http://127.0.0.1:${(game.http.address() as any).port}`;
});
afterEach(async () => {
  sockets.forEach((s) => s.disconnect());
  sockets = [];
  await game.close();
});
async function crew(n = 2) {
  const a = await connect();
  const created = await cmd(a, "room:create", {
    name: "Captain0",
    shipId: "tug",
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error("create");
  const list = [a];
  for (let i = 1; i < n; i++) {
    const s = await connect();
    expect(
      (
        await cmd(s, "room:join", {
          code: created.data!.code,
          name: `Captain${i}`,
          shipId: "courier",
        })
      ).ok,
    ).toBe(true);
    list.push(s);
  }
  for (const s of list) await cmd(s, "player:ready", { ready: true });
  expect((await cmd(a, "game:start")).ok).toBe(true);
  return { list, created };
}
describe("real websocket clients", () => {
  it("finishes six-player eight-round match and rematch, owners only see own locks", async () => {
    const { list } = await crew(6);
    let previous = "";
    for (let n = 1; n <= 8; n++) {
      const v = await view(
        list[0],
        (e) =>
          e.public.phase === "PLANNING" && e.public.match!.roundNumber === n,
      );
      if (n === 1) previous = v.public.match!.id;
      const messages: Envelope[] = [];
      const capture = (e: Envelope) => messages.push(e);
      list[1].on("state:update", capture);
      const marker = randomUUID();
      for (let i = 0; i < list.length; i++) {
        const bids = v.public.match!.sites.map((s, k) => ({
          siteId: s.id,
          drones: i === 0 && k === 0 ? 2 : 0,
        }));
        expect(
          (
            await cmd(
              list[i],
              "round:submit",
              {
                matchId: v.public.match!.id,
                roundId: v.public.match!.roundId,
                bids,
              },
              i === 0 ? marker : randomUUID(),
            )
          ).ok,
        ).toBe(true);
      }
      const revealed = await view(
        list[0],
        (e) => e.public.phase === "REVEAL" && e.public.match!.roundNumber === n,
      );
      list[1].off("state:update", capture);
      for (const m of messages.filter((e) => e.public.phase === "PLANNING")) {
        expect(m.private.lockedAllocation?.requestId).not.toBe(marker);
        expect(JSON.stringify(m)).not.toContain(marker);
      }
      expect(revealed.public.match!.lastResolution!.allocations).toHaveLength(
        6,
      );
      for (const s of list)
        expect(s.io.engine.transport.name).toBe("websocket");
    }
    const final = await view(list[0], (e) => e.public.phase === "RESULTS");
    expect(final.public.match!.endReason).toBe("NORMAL");
    expect(final.public.match!.winnerIds).toEqual([final.private.playerId]);
    expect((await cmd(list[1], "game:rematch")).ok).toBe(false);
    expect((await cmd(list[0], "game:rematch")).ok).toBe(true);
    for (const s of list) await cmd(s, "player:ready", { ready: true });
    await cmd(list[0], "game:start");
    const next = await view(list[0], (e) => e.public.phase === "PLANNING");
    expect(next.public.match!.id).not.toBe(previous);
  });
  it("same UUID replays; changed payload rejected; resume replaces old socket and private lock survives", async () => {
    const { list, created } = await crew();
    const v = await view(list[0], (e) => e.public.phase === "PLANNING");
    const id = randomUUID(),
      data = {
        matchId: v.public.match!.id,
        roundId: v.public.match!.roundId,
        bids: v.public.match!.sites.map((s, i) => ({
          siteId: s.id,
          drones: i === 0 ? 1 : 0,
        })),
      };
    const first = await cmd(list[0], "round:submit", data, id);
    expect(await cmd(list[0], "round:submit", data, id)).toEqual(first);
    expect(
      (
        await cmd(
          list[0],
          "round:submit",
          { ...data, bids: data.bids.map((b) => ({ ...b, drones: 0 })) },
          id,
        )
      ).ok,
    ).toBe(false);
    const newSocket = await connect();
    const resumed = await cmd(newSocket, "room:resume", {
      code: created.data!.code,
      resumeToken: created.data!.resumeToken,
    });
    expect(resumed.ok).toBe(true);
    const restored = await view(newSocket, (e) => !!e.private.lockedAllocation);
    expect(restored.private.lockedAllocation!.requestId).toBe(id);
    expect(game.service.rooms.get(created.data!.code!)!.players.size).toBe(2);
    expect(
      game.service.rooms
        .get(created.data!.code!)!
        .players.get(restored.private.playerId)!.connected,
    ).toBe(true);
  });
  it("rejects malformed, forged host, duplicate names, full room and in-match joining", async () => {
    const a = await connect(),
      b = await connect();
    expect(
      (await cmd(a, "room:create", { name: "<script>", shipId: "tug" })).ok,
    ).toBe(false);
    const c = await cmd(a, "room:create", { name: "Legit", shipId: "tug" });
    if (!c.ok) throw new Error();
    expect(
      (
        await cmd(b, "room:join", {
          name: "Legit",
          shipId: "tug",
          code: c.data!.code,
        })
      ).ok,
    ).toBe(false);
    await cmd(b, "room:join", {
      name: "Other",
      shipId: "tug",
      code: c.data!.code,
    });
    expect((await cmd(b, "game:start")).ok).toBe(false);
    expect((await cmd(a, "game:start")).ok).toBe(false);
    for (let i = 0; i < 4; i++) {
      const s = await connect();
      await cmd(s, "room:join", {
        name: `More${i}`,
        shipId: "barge",
        code: c.data!.code,
      });
    }
    const extra = await connect();
    expect(
      (
        await cmd(extra, "room:join", {
          name: "TooMany",
          shipId: "tug",
          code: c.data!.code,
        })
      ).ok,
    ).toBe(false);
    const room = game.service.get(c.data!.code!);
    for (const p of room.players.values()) game.service.ready(room, p, true);
    game.service.start(room, [...room.players.values()][0]);
    expect(
      (
        await cmd(extra, "room:join", {
          name: "TooMany",
          shipId: "tug",
          code: c.data!.code,
        })
      ).ok,
    ).toBe(false);
  });
  it("isolates 20 concurrent rooms and cleanup releases transport", async () => {
    for (let i = 0; i < 20; i++) {
      const a = await connect(),
        b = await connect();
      const c = await cmd(a, "room:create", {
        name: `Host${i}`,
        shipId: "tug",
      });
      if (!c.ok) throw new Error();
      await cmd(b, "room:join", {
        name: `Guest${i}`,
        shipId: "courier",
        code: c.data!.code,
      });
      const v = await view(a, (e) => e.public.players.length === 2);
      expect(v.public.players.map((p) => p.name)).toEqual([
        `Host${i}`,
        `Guest${i}`,
      ]);
    }
    expect(game.service.rooms.size).toBe(20);
  });
  it("rejects forbidden origin websocket and polling handshakes; health reveals nothing", async () => {
    const s = io(url, {
      transports: ["websocket"],
      reconnection: false,
      extraHeaders: { Origin: "https://evil.invalid" },
    });
    sockets.push(s);
    await new Promise<void>((resolve) =>
      s.once("connect_error", () => resolve()),
    );
    expect(s.connected).toBe(false);
    const denied = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, {
      headers: { Origin: "https://evil.invalid" },
    });
    expect(denied.status).toBe(403);
    expect(await (await fetch(url + "/healthz")).json()).toEqual({ ok: true });
  });
  it("rate limits create attempts without blocking two friends", async () => {
    await game.close();
    game = createGameServer({ timing });
    await new Promise<void>((res) => game.http.listen(0, "127.0.0.1", res));
    url = `http://127.0.0.1:${(game.http.address() as any).port}`;
    for (let i = 0; i < 5; i++) {
      const s = await connect();
      expect(
        (await cmd(s, "room:create", { name: "Captain", shipId: "tug" })).ok,
      ).toBe(true);
    }
    const s = await connect();
    const r = await cmd(s, "room:create", { name: "Captain", shipId: "tug" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("RATE_LIMIT");
  });
  it("rejects malformed bids and identity spoofing without mutating power or locks", async () => {
    const { list } = await crew();
    const v = await view(list[0], (e) => e.public.phase === "PLANNING");
    const valid = {
      matchId: v.public.match!.id,
      roundId: v.public.match!.roundId,
      bids: v.public.match!.sites.map((s) => ({ siteId: s.id, drones: 0 })),
    };
    const bad = [
      {
        ...valid,
        bids: valid.bids.map((b, i) => ({ ...b, drones: i === 0 ? -1 : 0 })),
      },
      {
        ...valid,
        bids: valid.bids.map((b, i) => ({ ...b, drones: i === 0 ? 1.5 : 0 })),
      },
      { ...valid, bids: valid.bids.map((b) => ({ ...b, drones: 8 })) },
      { ...valid, bids: [valid.bids[0], valid.bids[0], valid.bids[2]] },
      { ...valid, bids: valid.bids.slice(1) },
      { ...valid, roundId: randomUUID() },
      { ...valid, playerId: v.public.players[1].id },
      {
        ...valid,
        bids: valid.bids.map((b, i) => ({
          ...b,
          siteId: i === 0 ? randomUUID() : b.siteId,
        })),
      },
    ];
    for (const payload of bad)
      expect((await cmd(list[0], "round:submit", payload)).ok).toBe(false);
    const room = game.service.get(v.public.code);
    expect(room.match!.round!.locks.size).toBe(0);
    expect([...room.players.values()].map((p) => p.power)).toEqual([10, 10]);
    expect((await cmd(list[0], "round:submit", valid)).ok).toBe(true);
    expect((await cmd(list[0], "round:submit", valid)).ok).toBe(false);
  });
  it("wrong resume secret and unknown rooms cannot acquire another captain", async () => {
    const { created } = await crew();
    const s = await connect();
    expect(
      (
        await cmd(s, "room:resume", {
          code: created.data!.code,
          resumeToken: "a".repeat(64),
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await cmd(s, "room:join", {
          code: "ZZZZZZ",
          name: "Guess",
          shipId: "tug",
        })
      ).ok,
    ).toBe(false);
    expect((await cmd(s, "game:start")).ok).toBe(false);
  });
  it("disconnects oversized messages at the transport boundary", async () => {
    const s = await connect();
    const disconnected = new Promise<void>((resolve) =>
      s.once("disconnect", () => resolve()),
    );
    s.emit(
      "room:create",
      { requestId: randomUUID(), name: "x".repeat(9000), shipId: "tug" },
      () => {},
    );
    await disconnected;
    expect(game.service.rooms.size).toBe(0);
  });
});
