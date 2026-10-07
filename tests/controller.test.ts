import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  RoomService,
  type Room,
  type Captain,
} from "../apps/server/src/roomService.js";
import { CONFIG } from "../packages/shared/src/config.js";
function setup(n = 2) {
  let now = 0;
  const service = new RoomService(() => now);
  const a = service.create("Captain 0", "tug", "socket0");
  const players = [a.p];
  for (let i = 1; i < n; i++)
    players.push(
      service.join(a.room.code, `Captain ${i}`, "courier", `socket${i}`).p,
    );
  for (const p of players) service.ready(a.room, p, true);
  service.start(a.room, a.p);
  return {
    service,
    room: a.room,
    players,
    token: a.token,
    set: (t: number) => {
      now = t;
      service.tick();
    },
    add: (t: number) => {
      now += t;
      service.tick();
    },
    now: () => now,
  };
}
function submit(s: ReturnType<typeof setup>, p: Captain, bids = [0, 0, 0]) {
  const r = s.room.match!.round!;
  const plan = {
    requestId: randomUUID(),
    matchId: s.room.match!.id,
    roundId: r.id,
    bids: r.sites.map((site, i) => ({ siteId: site.id, drones: bids[i] })),
  };
  s.service.submit(s.room, p, plan);
  return plan;
}
describe("clock and settlement invariants", () => {
  it("holds all early locks until minimum and resolves once", () => {
    const s = setup();
    s.add(3000);
    submit(s, s.players[0], [2, 0, 0]);
    submit(s, s.players[1]);
    expect(s.room.phase).toBe("PLANNING");
    s.add(9999);
    expect(s.room.phase).toBe("PLANNING");
    s.add(1);
    expect(s.room.phase).toBe("REVEAL");
    const score = s.players[0].score;
    s.service.tick();
    expect(s.players[0].score).toBe(score);
    expect(s.room.match!.history).toHaveLength(1);
  });
  it("accepts just before deadline; rejects at deadline even before callback", () => {
    const s = setup();
    s.add(3000);
    s.set(37999);
    submit(s, s.players[0]);
    s.set(38000);
    expect(() => submit(s, s.players[1], [1, 0, 0])).toThrow();
    expect(s.room.match!.history).toHaveLength(1);
  });
  it("atomic second timeout cancels reserved cost when only one eligible remains", () => {
    const s = setup();
    s.add(3000);
    submit(s, s.players[0]);
    s.add(35000);
    s.add(8000);
    s.add(4000);
    const before = s.players[0].power;
    submit(s, s.players[0], [3, 0, 0]);
    s.add(25000);
    expect(s.room.phase).toBe("RESULTS");
    expect(s.room.match!.endReason).toBe("LAST_CAPTAIN");
    expect(s.room.match!.history).toHaveLength(1);
    expect(s.players[0].power).toBe(before);
  });
  it("explicit locked zero resets timeout counter", () => {
    const s = setup();
    s.add(3000);
    submit(s, s.players[0]);
    s.add(35000);
    s.add(8000);
    s.add(4000);
    expect(s.players[1].roundsMissed).toBe(1);
    submit(s, s.players[1]);
    expect(s.players[1].roundsMissed).toBe(0);
  });
  it("forfeited accepted lock charged but cannot win with three remaining", () => {
    const s = setup(4);
    s.add(3000);
    submit(s, s.players[0], [3, 0, 0]);
    s.service.leave(s.room, s.players[0]);
    for (const p of s.players.slice(1)) submit(s, p, [1, 0, 0]);
    s.add(10000);
    const result = s.room.match!.history[0];
    expect(result.powerSpent[s.players[0].id]).toBe(3);
    expect(result.creditsEarned[s.players[0].id]).toBe(0);
    expect(result.recharge[s.players[0].id].applied).toBe(0);
  });
  it("two-player leave cancels unresolved costs and labels last captain", () => {
    const s = setup();
    s.add(3000);
    submit(s, s.players[0], [3, 0, 0]);
    s.service.leave(s.room, s.players[1]);
    expect(s.room.match!.endReason).toBe("LAST_CAPTAIN");
    expect(s.players[0].power).toBe(10);
  });
  it("resume swaps active socket and stale disconnect cannot affect new control", () => {
    const s = setup();
    s.add(3000);
    const plan = submit(s, s.players[0], [2, 0, 0]);
    s.service.disconnect(s.room, s.players[0].id, "socket0");
    const restored = s.service.resume(s.room.code, s.token, "new");
    s.service.disconnect(s.room, s.players[0].id, "socket0");
    expect(restored.p.connected).toBe(true);
    expect(
      s.service.project(s.room, s.players[0].id).private.lockedAllocation,
    ).toEqual(plan);
    expect(() =>
      s.service.captain(s.room, s.players[0].id, "socket0"),
    ).toThrow();
    expect(s.room.hostId).toBe(s.players[1].id);
  });
  it("privacy projector never exposes rival bids, hashes, sockets or seed", () => {
    const s = setup();
    s.add(3000);
    const plan = submit(s, s.players[0], [7, 1, 0]);
    const view = s.service.project(s.room, s.players[1].id);
    const serialized = JSON.stringify(view);
    expect(view.private.lockedAllocation).toBeUndefined();
    for (const secret of [
      plan.requestId,
      s.token,
      s.room.match!.seed,
      s.players[0].tokenHash,
      "socket0",
    ])
      expect(serialized).not.toContain(secret);
    expect(view.public.match!.lastResolution).toBeUndefined();
  });
  it("countdown cancelled on disconnect; lobby seats expire and idle cleanup runs", () => {
    const s = setup();
    s.service.disconnect(s.room, s.players[1].id, "socket1");
    expect(s.room.phase).toBe("LOBBY");
    s.add(60000);
    expect(s.room.players.size).toBe(1);
    s.add(CONFIG.lobbyIdle);
    expect(s.service.rooms.size).toBe(0);
  });
  it("disconnected seats forfeit at 90 seconds; no abandoned room survives", () => {
    const s = setup(3);
    s.add(3000);
    for (let i = 0; i < 3; i++)
      s.service.disconnect(s.room, s.players[i].id, `socket${i}`);
    s.add(90000);
    expect(s.service.rooms.size).toBe(0);
  });
  it("normal eight rounds, shared victory, rematch fresh seed and stale round rejection", () => {
    const s = setup();
    s.add(3000);
    const seed = s.room.match!.seed;
    let old;
    for (let n = 1; n <= 8; n++) {
      old = submit(s, s.players[0]);
      submit(s, s.players[1]);
      s.add(10000);
      s.add(8000);
      s.add(4000);
    }
    expect(s.room.phase).toBe("RESULTS");
    expect(s.room.match!.endReason).toBe("NORMAL");
    expect(s.room.match!.winnerIds).toHaveLength(2);
    expect(s.room.match!.history).toHaveLength(8);
    s.service.rematch(s.room, s.players[0]);
    for (const p of s.players) s.service.ready(s.room, p, true);
    s.service.start(s.room, s.players[0]);
    s.add(3000);
    expect(s.room.match!.seed).not.toBe(seed);
    expect(() => s.service.submit(s.room, s.players[0], old!)).toThrow();
  });
  it("results expiry and hard lobby lifetime", () => {
    const s = setup();
    s.add(3000);
    s.service.leave(s.room, s.players[1]);
    s.add(CONFIG.resultsIdle);
    expect(s.service.rooms.size).toBe(0);
  });
  it("non-host roster departures reset remaining lobby readiness", () => {
    let now = 0;
    const service = new RoomService(() => now);
    const a = service.create("Host", "tug", "s0");
    const b = service.join(a.room.code, "Guest", "tug", "s1");
    const c = service.join(a.room.code, "Third", "tug", "s2");
    for (const p of a.room.players.values()) service.ready(a.room, p, true);
    service.leave(a.room, c.p);
    expect([...a.room.players.values()].every((p) => !p.ready)).toBe(true);
    for (const p of a.room.players.values()) service.ready(a.room, p, true);
    service.disconnect(a.room, b.p.id, "s1");
    now = 60000;
    service.tick();
    expect(a.room.players.size).toBe(1);
    expect(a.p.ready).toBe(false);
  });
});
