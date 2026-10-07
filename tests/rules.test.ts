import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  resolveRound,
  allocationCost,
  validatePlan,
  victory,
} from "../packages/shared/src/rules.js";
import { Deck, seeded } from "../packages/shared/src/deck.js";
import type { Site } from "../packages/shared/src/types.js";
const site = (credits = 9, minimum = 1, cost = 1, bonus = 0): Site => ({
  id: randomUUID(),
  templateId: "test",
  name: "Test",
  tier: "low",
  credits,
  minimum,
  cost,
  bonus,
  flavor: "",
});
function round(claims: number[], s = site(), number = 1) {
  return resolveRound(
    "round",
    number,
    [s],
    claims.map((_, i) => ({ id: String(i), power: 12, forfeited: false })),
    claims.map((n, i) => ({
      playerId: String(i),
      bids: [{ siteId: s.id, drones: n }],
      source: "PLAYER",
    })),
  );
}
describe("exact economy", () => {
  it("charges winner and loser", () => {
    const r = round([3, 2, 0]);
    expect(r.creditsEarned).toEqual({ "0": 9, "1": 0, "2": 0 });
    expect(r.powerSpent).toEqual({ "0": 3, "1": 2, "2": 0 });
  });
  it("splits ties with remainder", () => {
    const r = round([3, 3, 1]);
    expect(r.creditsEarned).toEqual({ "0": 4, "1": 4, "2": 0 });
    expect(r.sites[0].scrapped).toBe(1);
  });
  it("zero credit six-way tie recharges consolation", () => {
    const r = round([1, 1, 1, 1, 1, 1], site(3));
    expect(Object.values(r.creditsEarned)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(r.recharge["0"].consolation).toBe(1);
  });
  it("under minimum still costs; exact minimum qualifies", () => {
    expect(round([2, 2, 0], site(10, 3)).sites[0].outcome).toBe("UNCLAIMED");
    expect(round([3, 2], site(10, 3)).creditsEarned["0"]).toBe(10);
  });
  it("hazard costs double, strength unchanged", () => {
    expect(round([3, 2], site(8, 1, 2)).powerSpent["0"]).toBe(6);
    expect(round([3, 2], site(8, 1, 2)).creditsEarned["0"]).toBe(8);
  });
  it("solo bonus suppressed on ties", () => {
    expect(round([3, 2], site(6, 1, 1, 2)).creditsEarned["0"]).toBe(8);
    expect(round([3, 3], site(6, 1, 1, 2)).creditsEarned["0"]).toBe(3);
  });
  it("recharge exact, capped, absent at final", () => {
    const s = site();
    const r = resolveRound(
      "r",
      1,
      [s],
      [
        { id: "a", power: 10, forfeited: false },
        { id: "b", power: 10, forfeited: false },
      ],
      [
        {
          playerId: "a",
          bids: [{ siteId: s.id, drones: 7 }],
          source: "PLAYER",
        },
        {
          playerId: "b",
          bids: [{ siteId: s.id, drones: 8 }],
          source: "PLAYER",
        },
      ],
    );
    expect(r.powerAfter.a).toBe(8);
    expect(r.powerAfter.b).toBe(6);
    expect(round([0, 0]).powerAfter["0"]).toBe(12);
    expect(round([3, 2], s, 8).powerAfter["0"]).toBe(9);
  });
  it("rejects duplicate, missing, fractional, negative, unknown and overbudget bids", () => {
    const s = site();
    for (const n of [-1, 1.5, 9, Infinity])
      expect(() =>
        allocationCost([s], [{ siteId: s.id, drones: n }]),
      ).toThrow();
    expect(() => allocationCost([s], [])).toThrow();
    expect(() =>
      allocationCost([s], [{ siteId: "wrong", drones: 1 }]),
    ).toThrow();
    expect(() =>
      validatePlan([site(8, 1, 2)], [{ siteId: s.id, drones: 8 }], 10),
    ).toThrow();
  });
  it("excludes forfeits and shares victory", () => {
    expect(
      victory([
        { id: "a", score: 9, forfeited: false },
        { id: "b", score: 9, forfeited: false },
        { id: "c", score: 99, forfeited: true },
      ]),
    ).toEqual(["a", "b"]);
  });
  it("forfeit keeps accepted cost but loses reward and recharge", () => {
    const s = site();
    const r = resolveRound(
      "r",
      1,
      [s],
      [
        { id: "a", power: 10, forfeited: true },
        { id: "b", power: 10, forfeited: false },
      ],
      [
        {
          playerId: "a",
          bids: [{ siteId: s.id, drones: 8 }],
          source: "PLAYER",
        },
        {
          playerId: "b",
          bids: [{ siteId: s.id, drones: 1 }],
          source: "PLAYER",
        },
      ],
    );
    expect(r.creditsEarned.a).toBe(0);
    expect(r.powerAfter.a).toBe(2);
    expect(r.creditsEarned.b).toBe(9);
  });
});
it("seeded decks obey tier, intro and modifier constraints for 300 seeds", () => {
  for (let seed = 0; seed < 300; seed++) {
    const d = new Deck(String(seed));
    const ids = new Set();
    for (let n = 1; n <= 8; n++) {
      const sites = d.draw(n, randomUUID);
      expect(new Set(sites.map((s) => s.tier)).size).toBe(3);
      expect(sites.filter((s) => s.cost === 2).length).toBeLessThanOrEqual(1);
      expect(
        sites.filter((s) => s.cost > 1 || s.minimum > 1 || s.bonus > 0).length,
      ).toBeLessThanOrEqual(n <= 2 ? 0 : 2);
      for (const s of sites) {
        expect(ids.has(s.id)).toBe(false);
        ids.add(s.id);
      }
    }
  }
});
it("random allocations preserve power, reward bounds and ordering; no input mutation", () => {
  const rng = seeded("invariants");
  for (let k = 0; k < 1000; k++) {
    const sites = new Deck(String(k)).draw(3, randomUUID);
    const count = 2 + Math.floor(rng() * 5);
    const players = Array.from({ length: count }, (_, i) => ({
      id: String(i),
      power: 10,
      forfeited: false,
    }));
    const plans = players.map((p) => {
      let budget = 10;
      const bids = sites.map((s) => {
        const drones = Math.floor(
          rng() * (Math.min(8, Math.floor(budget / s.cost)) + 1),
        );
        budget -= drones * s.cost;
        return { siteId: s.id, drones };
      });
      return { playerId: p.id, bids, source: "PLAYER" as const };
    });
    const before = JSON.stringify({ sites, players, plans });
    const a = resolveRound("r", 1, sites, players, plans),
      b = resolveRound(
        "r",
        1,
        sites,
        [...players].reverse(),
        [...plans].reverse(),
      );
    expect(a.creditsEarned).toEqual(b.creditsEarned);
    expect(JSON.stringify({ sites, players, plans })).toBe(before);
    for (const p of players) {
      expect(a.powerAfter[p.id]).toBeGreaterThanOrEqual(0);
      expect(a.powerAfter[p.id]).toBeLessThanOrEqual(12);
    }
    for (const [i, s] of sites.entries()) {
      const total = Object.values(a.sites[i].creditsByPlayer).reduce(
        (x, y) => x + y,
        0,
      );
      expect(total).toBeLessThanOrEqual(
        s.credits + (a.sites[i].outcome === "UNIQUE" ? s.bonus : 0),
      );
    }
  }
});
