import { randomBytes, randomInt, randomUUID, createHash } from "node:crypto";
import { CONFIG, type Timing } from "../../../packages/shared/src/config.js";
import { Deck } from "../../../packages/shared/src/deck.js";
import {
  resolveRound,
  validatePlan,
  victory,
} from "../../../packages/shared/src/rules.js";
import type {
  Envelope,
  Phase,
  Plan,
  PlayerView,
  RoundResult,
  Ship,
  Site,
  ResolvedPlan,
} from "../../../packages/shared/src/types.js";
export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const fail = (code: string, message: string): never => {
  throw new GameError(code, message);
};
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export interface Captain extends PlayerView {
  joinOrder: number;
  tokenHash: string;
  socketId?: string;
  disconnectedAt?: number;
  cache: Map<string, { fingerprint: string; ack: unknown; expires: number }>;
}
interface Round {
  id: string;
  number: number;
  sites: Site[];
  startPower: Record<string, number>;
  started: number;
  deadline: number;
  earliest: number;
  locks: Map<string, Plan>;
}
interface Match {
  id: string;
  seed: string;
  deck: Deck;
  round?: Round;
  history: RoundResult[];
  winnerIds?: string[];
  endReason?: "NORMAL" | "LAST_CAPTAIN" | "ALL_LEFT";
  started: number;
}
export interface Room {
  code: string;
  phase: Phase;
  hostId: string | null;
  players: Map<string, Captain>;
  revision: number;
  created: number;
  activity: number;
  lastConnected: number;
  phaseStarted: number;
  phaseEnds: number;
  match?: Match;
}
export class RoomService {
  rooms = new Map<string, Room>();
  accepting = true;
  constructor(
    public now: () => number = Date.now,
    public timing: Timing = CONFIG.timing,
    public changed: (room: Room) => void = () => {},
    public closed: (room: Room) => void = () => {},
  ) {}
  private touch(room: Room, activity = true) {
    room.revision++;
    if (activity) room.activity = this.now();
    this.changed(room);
  }
  private resetReady(room: Room) {
    for (const p of room.players.values()) p.ready = false;
  }
  private elect(room: Room) {
    const host = room.hostId ? room.players.get(room.hostId) : undefined;
    if (host?.connected && !host.forfeited) return;
    room.hostId =
      [...room.players.values()]
        .filter((p) => p.connected && !p.forfeited)
        .sort((a, b) => a.joinOrder - b.joinOrder)[0]?.id ?? null;
    this.resetReady(room);
  }
  private makeCaptain(
    room: Room,
    name: string,
    shipId: Ship,
    socketId: string,
  ) {
    if (
      [...room.players.values()].some(
        (p) => p.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    )
      fail("DUPLICATE_NAME", "That callsign is taken. Try adding a number.");
    const token = randomBytes(32).toString("hex");
    const used = new Set([...room.players.values()].map((p) => p.identitySlot));
    const identitySlot = Array.from({ length: 6 }, (_, i) => i).find(
      (i) => !used.has(i),
    )!;
    const p: Captain = {
      id: randomUUID(),
      name,
      shipId,
      identitySlot,
      joinOrder:
        Math.max(0, ...[...room.players.values()].map((p) => p.joinOrder)) + 1,
      connected: true,
      ready: false,
      forfeited: false,
      score: 0,
      power: CONFIG.startPower,
      roundsMissed: 0,
      stats: { sitesWon: 0, sitesCoWon: 0, powerSpent: 0 },
      tokenHash: hash(token),
      socketId,
      cache: new Map(),
    };
    room.players.set(p.id, p);
    room.lastConnected = this.now();
    this.resetReady(room);
    return { p, token };
  }
  create(name: string, shipId: Ship, socketId: string) {
    if (!this.accepting)
      fail(
        "MAINTENANCE",
        "The sector is closed for maintenance. Please try later.",
      );
    if (
      this.rooms.size >= CONFIG.maxRooms ||
      [...this.rooms.values()].reduce((n, r) => n + r.players.size, 0) >=
        CONFIG.maxPlayersTotal
    )
      fail("CAPACITY", "The sector is busy. Try again shortly.");
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code: string;
    do {
      code = Array.from(
        { length: 6 },
        () => alphabet[randomInt(alphabet.length)],
      ).join("");
    } while (this.rooms.has(code));
    const now = this.now();
    const room: Room = {
      code,
      phase: "LOBBY",
      hostId: null,
      players: new Map(),
      revision: 0,
      created: now,
      activity: now,
      lastConnected: now,
      phaseStarted: now,
      phaseEnds: 0,
    };
    this.rooms.set(code, room);
    const { p, token } = this.makeCaptain(room, name, shipId, socketId);
    room.hostId = p.id;
    this.touch(room);
    return { room, p, token };
  }
  get(code: string) {
    const r = this.rooms.get(code);
    if (!r)
      fail(
        "ROOM_NOT_FOUND",
        "Room not found or no longer available. This session may have ended after a server restart. Create a new room.",
      );
    return r!;
  }
  join(code: string, name: string, shipId: Ship, socketId: string) {
    const room = this.get(code);
    this.tickRoom(room);
    if (room.phase !== "LOBBY")
      fail(
        "IN_PROGRESS",
        "Match in progress—try again when this crew returns.",
      );
    if (room.players.size >= 6)
      fail("FULL", "This crew already has six captains.");
    const { p, token } = this.makeCaptain(room, name, shipId, socketId);
    this.elect(room);
    this.touch(room);
    return { room, p, token };
  }
  resume(code: string, token: string, socketId: string) {
    const room = this.get(code);
    this.tickRoom(room);
    if (!this.rooms.has(code))
      fail("ROOM_NOT_FOUND", "This session ended. Create a new room.");
    const p = [...room.players.values()].find(
      (p) => p.tokenHash === hash(token),
    );
    if (!p)
      fail(
        "SESSION_EXPIRED",
        "This seat has expired. Return to the start screen.",
      );
    const oldSocket = p!.socketId;
    p!.socketId = socketId;
    p!.connected = true;
    p!.disconnectedAt = undefined;
    room.lastConnected = this.now();
    this.elect(room);
    this.touch(room, false);
    return { room, p: p!, oldSocket };
  }
  captain(room: Room, id: string, socketId: string) {
    const p = room.players.get(id);
    if (!p || p.socketId !== socketId || !p.connected)
      fail("SESSION_REPLACED", "This captain is active in another tab.");
    return p!;
  }
  disconnect(room: Room, id: string, socketId: string) {
    const p = room.players.get(id);
    if (!p || p.socketId !== socketId) return;
    p.connected = false;
    p.ready = false;
    p.disconnectedAt = this.now();
    p.socketId = undefined;
    this.elect(room);
    this.touch(room, false);
    this.tickRoom(room);
  }
  ready(room: Room, p: Captain, ready: boolean) {
    if (room.phase !== "LOBBY" && room.phase !== "RESULTS")
      fail("WRONG_PHASE", "Wait until this match ends.");
    p.ready = ready;
    this.touch(room);
  }
  update(room: Room, p: Captain, data: { name?: string; shipId?: Ship }) {
    if (room.phase !== "LOBBY")
      fail("WRONG_PHASE", "Change your callsign in the lobby.");
    if (
      data.name &&
      [...room.players.values()].some(
        (q) =>
          q.id !== p.id &&
          q.name.toLocaleLowerCase() === data.name!.toLocaleLowerCase(),
      )
    )
      fail("DUPLICATE_NAME", "That callsign is taken.");
    if (data.name) p.name = data.name;
    if (data.shipId) p.shipId = data.shipId;
    this.resetReady(room);
    this.touch(room);
  }
  start(room: Room, p: Captain) {
    if (room.hostId !== p.id)
      fail("HOST_ONLY", "Only the host can launch this crew.");
    if (room.phase !== "LOBBY")
      fail("WRONG_PHASE", "This match has already started.");
    const connected = [...room.players.values()].filter((p) => p.connected);
    if (
      connected.length < 2 ||
      room.players.size !== connected.length ||
      connected.some((p) => !p.ready)
    )
      fail(
        "NOT_READY",
        "At least two captains must be connected, and everyone must be ready.",
      );
    const seed = randomBytes(16).toString("hex");
    room.match = {
      id: randomUUID(),
      seed,
      deck: new Deck(seed),
      history: [],
      started: this.now(),
    };
    this.phase(room, "STARTING", this.timing.starting);
  }
  private phase(room: Room, phase: Phase, duration: number) {
    room.phase = phase;
    room.phaseStarted = this.now();
    room.phaseEnds = duration ? this.now() + duration : 0;
    this.touch(room, false);
  }
  private planning(room: Room) {
    const m = room.match!;
    const number = m.history.length + 1;
    const started = this.now();
    m.round = {
      id: randomUUID(),
      number,
      sites: m.deck.draw(number, randomUUID),
      startPower: Object.fromEntries(
        [...room.players.values()].map((p) => [p.id, p.power]),
      ),
      started,
      deadline:
        started +
        (number === 1 ? this.timing.firstPlanning : this.timing.planning),
      earliest: started + this.timing.minimumPlanning,
      locks: new Map(),
    };
    this.phase(
      room,
      "PLANNING",
      number === 1 ? this.timing.firstPlanning : this.timing.planning,
    );
  }
  submit(room: Room, p: Captain, plan: Plan) {
    this.tickRoom(room);
    const m = room.match,
      r = m?.round;
    if (room.phase !== "PLANNING" || !r || !m)
      fail(
        "WRONG_PHASE",
        "Orders are no longer being accepted for this round.",
      );
    if (p.forfeited) fail("FORFEITED", "You have forfeited this match.");
    if (plan.matchId !== m!.id || plan.roundId !== r!.id)
      fail("STALE_ROUND", "These orders belong to an earlier round.");
    if (this.now() >= r!.deadline)
      fail("DEADLINE", "The planning deadline has passed.");
    if (r!.locks.has(p.id)) fail("LOCKED", "Your orders are already locked.");
    try {
      validatePlan(r!.sites, plan.bids, r!.startPower[p.id]);
    } catch (e) {
      fail("INVALID_PLAN", (e as Error).message);
    }
    r!.locks.set(p.id, structuredClone(plan));
    p.roundsMissed = 0;
    this.touch(room);
    this.tickRoom(room);
  }
  private eligible(room: Room) {
    return [...room.players.values()].filter((p) => !p.forfeited);
  }
  private abandonment(room: Room) {
    if (
      !room.match ||
      room.phase === "LOBBY" ||
      room.phase === "RESULTS" ||
      room.phase === "STARTING"
    )
      return false;
    const eligible = this.eligible(room);
    if (eligible.length >= 2) return false;
    room.match.winnerIds = eligible.map((p) => p.id);
    room.match.endReason = eligible.length ? "LAST_CAPTAIN" : "ALL_LEFT";
    this.phase(room, "RESULTS", 0);
    return true;
  }
  private settle(room: Room) {
    const r = room.match!.round!;
    const timedOut = this.now() >= r.deadline;
    if (timedOut)
      for (const p of this.eligible(room)) {
        if (!r.locks.has(p.id)) {
          p.roundsMissed++;
          if (p.roundsMissed >= 2) {
            p.forfeited = true;
            p.forfeitedReason = "AFK";
            p.ready = false;
          }
        }
      }
    this.elect(room);
    if (this.abandonment(room)) return;
    const allocations: ResolvedPlan[] = [...room.players.values()].map((p) => ({
      playerId: p.id,
      bids:
        r.locks.get(p.id)?.bids ??
        r.sites.map((s) => ({ siteId: s.id, drones: 0 })),
      source: r.locks.has(p.id)
        ? "PLAYER"
        : p.forfeited
          ? "FORFEIT"
          : "TIMEOUT",
    }));
    const result = resolveRound(
      r.id,
      r.number,
      r.sites,
      [...room.players.values()].map((p) => ({
        id: p.id,
        power: r.startPower[p.id],
        forfeited: p.forfeited,
      })),
      allocations,
    );
    for (const p of room.players.values()) {
      p.score += result.creditsEarned[p.id];
      p.power = result.powerAfter[p.id];
      p.stats.powerSpent += result.powerSpent[p.id];
      for (const site of result.sites)
        if (site.winnerIds.includes(p.id)) {
          if (site.outcome === "UNIQUE") p.stats.sitesWon++;
          else p.stats.sitesCoWon++;
        }
    }
    room.match!.history.push(result);
    this.phase(room, "REVEAL", this.timing.reveal);
  }
  leave(room: Room, p: Captain) {
    p.connected = false;
    p.socketId = undefined;
    p.disconnectedAt = this.now();
    if (
      room.phase === "LOBBY" ||
      room.phase === "STARTING" ||
      room.phase === "RESULTS"
    ) {
      room.players.delete(p.id);
      if (room.phase === "LOBBY") this.resetReady(room);
      if (room.phase === "STARTING") {
        room.match = undefined;
        room.phase = "LOBBY";
        this.resetReady(room);
      }
    } else {
      p.forfeited = true;
      p.forfeitedReason = "LEFT";
      p.ready = false;
      p.tokenHash = "";
    }
    this.elect(room);
    if (!room.players.size) {
      this.delete(room);
      return;
    }
    this.touch(room);
    this.abandonment(room);
  }
  rematch(room: Room, p: Captain) {
    if (room.hostId !== p.id)
      fail("HOST_ONLY", "Only the host can return the crew to the lobby.");
    if (room.phase !== "RESULTS")
      fail("WRONG_PHASE", "Finish the match first.");
    for (const q of room.players.values()) {
      if (q.forfeited || !q.connected) {
        room.players.delete(q.id);
        continue;
      }
      q.score = 0;
      q.power = CONFIG.startPower;
      q.roundsMissed = 0;
      q.ready = false;
      q.stats = { sitesWon: 0, sitesCoWon: 0, powerSpent: 0 };
      q.cache.clear();
    }
    room.match = undefined;
    this.elect(room);
    this.phase(room, "LOBBY", 0);
    room.activity = this.now();
  }
  tickRoom(room: Room) {
    if (!this.rooms.has(room.code)) return;
    const now = this.now();
    let dirty = false;
    for (const p of [...room.players.values()]) {
      for (const [key, c] of p.cache) if (c.expires <= now) p.cache.delete(key);
      if (
        !p.connected &&
        p.disconnectedAt !== undefined &&
        now - p.disconnectedAt >=
          (room.phase === "LOBBY" ? CONFIG.lobbyGrace : CONFIG.matchGrace)
      ) {
        if (
          room.phase === "LOBBY" ||
          room.phase === "STARTING" ||
          room.phase === "RESULTS"
        ) {
          room.players.delete(p.id);
          dirty = true;
        } else if (!p.forfeited) {
          p.forfeited = true;
          p.forfeitedReason = "DISCONNECTED";
          p.ready = false;
          dirty = true;
        }
      }
    }
    if (!room.players.size) {
      this.delete(room);
      return;
    }
    if (
      room.phase === "STARTING" &&
      [...room.players.values()].filter((p) => p.connected && !p.forfeited)
        .length < 2
    ) {
      room.match = undefined;
      this.resetReady(room);
      this.phase(room, "LOBBY", 0);
    }
    if (dirty) {
      if (room.phase === "LOBBY") this.resetReady(room);
      this.elect(room);
      this.touch(room, false);
    }
    this.abandonment(room);
    const connected = [...room.players.values()].some((p) => p.connected);
    if (connected) room.lastConnected = now;
    if (!connected && now - room.lastConnected >= CONFIG.matchGrace) {
      this.delete(room);
      return;
    }
    if (
      (room.phase === "LOBBY" &&
        (now - room.activity >= CONFIG.lobbyIdle ||
          now - room.created >= CONFIG.lobbyHard)) ||
      (room.phase === "RESULTS" && now - room.activity >= CONFIG.resultsIdle)
    ) {
      this.delete(room);
      return;
    }
    if (room.phase === "PLANNING") {
      const r = room.match!.round!;
      if (
        now >= r.deadline ||
        (now >= r.earliest &&
          this.eligible(room).every((p) => r.locks.has(p.id)))
      )
        this.settle(room);
    } else if (room.phase === "STARTING" && now >= room.phaseEnds)
      this.planning(room);
    else if (room.phase === "REVEAL" && now >= room.phaseEnds)
      this.phase(room, "SUMMARY", this.timing.summary);
    else if (room.phase === "SUMMARY" && now >= room.phaseEnds) {
      if (room.match!.history.length >= 8) {
        room.match!.winnerIds = victory([...room.players.values()]);
        room.match!.endReason = "NORMAL";
        room.activity = now;
        this.phase(room, "RESULTS", 0);
      } else this.planning(room);
    }
  }
  tick() {
    for (const room of this.rooms.values()) this.tickRoom(room);
  }
  delete(room: Room) {
    this.rooms.delete(room.code);
    for (const p of room.players.values()) p.cache.clear();
    this.closed(room);
  }
  project(room: Room, playerId: string): Envelope {
    const m = room.match,
      r = m?.round;
    return {
      protocolVersion: 1,
      serverNow: this.now(),
      public: {
        code: room.code,
        revision: room.revision,
        phase: room.phase,
        hostId: room.hostId,
        players: [...room.players.values()].map((p) => ({
          id: p.id,
          name: p.name,
          shipId: p.shipId,
          identitySlot: p.identitySlot,
          connected: p.connected,
          ready: p.ready,
          forfeited: p.forfeited,
          forfeitedReason: p.forfeitedReason,
          score: p.score,
          power: room.phase === "PLANNING" ? r!.startPower[p.id] : p.power,
          roundsMissed: p.roundsMissed,
          stats: { ...p.stats },
        })),
        match: m
          ? {
              id: m.id,
              roundId: r?.id,
              roundNumber: r?.number ?? 0,
              sites: r?.sites ?? [],
              lockedPlayerIds: r ? [...r.locks.keys()] : [],
              phaseStartedAt: room.phaseStarted,
              phaseEndsAt: room.phaseEnds,
              earliestRevealAt: r?.earliest,
              lastResolution: m.history.at(-1),
              winnerIds: m.winnerIds,
              endReason: m.endReason,
            }
          : undefined,
      },
      private: {
        playerId,
        lockedAllocation: r?.locks.get(playerId)
          ? structuredClone(r.locks.get(playerId))
          : undefined,
      },
    };
  }
}
