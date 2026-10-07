import { Deck, seeded } from "../packages/shared/src/deck.js";
import { resolveRound, victory } from "../packages/shared/src/rules.js";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { Site } from "../packages/shared/src/types.js";
const policies = [
  "random",
  "concentrate",
  "spread",
  "save-burst",
  "previous-read",
] as const;
const report = [];
for (const count of [2, 4, 6]) {
  let ties = 0,
    unclaimed = 0,
    passed = 0,
    zeroCredits = 0,
    powerTotal = 0,
    spending = 0,
    credits = 0;
  const wins: Record<string, number> = {};
  for (let seed = 0; seed < 300; seed++) {
    const random = seeded(`policy-${seed}`),
      deck = new Deck(String(seed));
    let previous: Record<string, number> = {};
    const players = Array.from({ length: count }, (_, i) => ({
      id: String(i),
      policy: policies[(seed + i) % policies.length],
      power: 10,
      score: 0,
      forfeited: false,
    }));
    for (let round = 1; round <= 8; round++) {
      const sites = deck.draw(round, randomUUID);
      const allocations = players.map((p) => {
        powerTotal += p.power;
        let budget = p.power;
        const bids = sites.map((s) => ({ siteId: s.id, drones: 0 }));
        const set = (s: Site, n: number) => {
          const b = bids.find((b) => b.siteId === s.id)!;
          b.drones = Math.min(8, Math.max(0, n), Math.floor(budget / s.cost));
          budget -= b.drones * s.cost;
        };
        const byValue = [...sites].sort(
          (a, b) =>
            (b.credits + b.bonus) / b.cost - (a.credits + a.bonus) / a.cost,
        );
        if (p.policy === "random")
          for (const s of sites) set(s, Math.floor(random() * 5));
        if (p.policy === "concentrate")
          set(byValue[0], Math.floor(budget / byValue[0].cost));
        if (p.policy === "spread")
          for (const s of byValue)
            set(s, Math.max(s.minimum, Math.floor(p.power / 4 / s.cost)));
        if (p.policy === "save-burst" && round % 2 === 0) set(byValue[0], 8);
        if (p.policy === "previous-read")
          for (const s of byValue) set(s, (previous[s.tier] ?? 1) + 1);
        if (bids.every((b) => !b.drones)) passed++;
        return { playerId: p.id, bids, source: "PLAYER" as const };
      });
      const result = resolveRound("r", round, sites, players, allocations);
      previous = {};
      for (const [i, s] of sites.entries()) {
        const r = result.sites[i];
        ties += Number(r.outcome === "TIED");
        unclaimed += Number(r.outcome === "UNCLAIMED");
        previous[s.tier] = r.maximum ?? 0;
      }
      for (const p of players) {
        p.power = result.powerAfter[p.id];
        p.score += result.creditsEarned[p.id];
        credits += result.creditsEarned[p.id];
        spending += result.powerSpent[p.id];
        zeroCredits += Number(!result.creditsEarned[p.id]);
      }
    }
    for (const id of victory(players)) {
      const policy = players.find((p) => p.id === id)!.policy;
      wins[policy] = (wins[policy] ?? 0) + 1;
    }
  }
  report.push({
    players: count,
    seeds: 300,
    tieRate: ties / 7200,
    unclaimedRate: unclaimed / 7200,
    passRate: passed / (300 * 8 * count),
    zeroCreditRoundRate: zeroCredits / (300 * 8 * count),
    meanStartPower: powerTotal / (300 * 8 * count),
    powerPerCredit: spending / credits,
    winsByPolicy: wins,
  });
}
writeFileSync("artifacts/balance-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
