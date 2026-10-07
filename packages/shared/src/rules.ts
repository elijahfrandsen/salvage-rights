import { CONFIG } from "./config.js";
import type { Bid, Site, RoundResult, ResolvedPlan } from "./types.js";
export function allocationCost(sites: Site[], bids: Bid[]): number {
  if (
    bids.length !== sites.length ||
    new Set(bids.map((b) => b.siteId)).size !== sites.length
  )
    throw new Error("Include each salvage site exactly once.");
  return bids.reduce((sum, b) => {
    const s = sites.find((s) => s.id === b.siteId);
    if (
      !s ||
      !Number.isInteger(b.drones) ||
      b.drones < 0 ||
      b.drones > CONFIG.maxBid
    )
      throw new Error("Invalid drone allocation.");
    return sum + b.drones * s.cost;
  }, 0);
}
export function validatePlan(sites: Site[], bids: Bid[], power: number) {
  const cost = allocationCost(sites, bids);
  if (cost > power) throw new Error("That plan exceeds your available power.");
  return cost;
}
export function resolveRound(
  roundId: string,
  number: number,
  sites: Site[],
  players: { id: string; power: number; forfeited: boolean }[],
  allocations: ResolvedPlan[],
): RoundResult {
  const result: RoundResult = {
    roundId,
    number,
    allocations: structuredClone(allocations),
    sites: [],
    creditsEarned: {},
    powerSpent: {},
    powerAfter: {},
    recharge: {},
  };
  for (const p of players) {
    const a = allocations.find((a) => a.playerId === p.id);
    if (!a) throw new Error("Missing allocation.");
    result.powerSpent[p.id] = validatePlan(sites, a.bids, p.power);
    result.creditsEarned[p.id] = 0;
  }
  for (const s of sites) {
    const claims = players
      .filter((p) => !p.forfeited)
      .map((p) => ({
        id: p.id,
        n: allocations
          .find((a) => a.playerId === p.id)!
          .bids.find((b) => b.siteId === s.id)!.drones,
      }))
      .filter((c) => c.n >= s.minimum);
    const maximum = claims.length ? Math.max(...claims.map((c) => c.n)) : null;
    const winners = claims.filter((c) => c.n === maximum).map((c) => c.id);
    const reward =
      winners.length === 1
        ? s.credits + s.bonus
        : winners.length
          ? Math.floor(s.credits / winners.length)
          : 0;
    const creditsByPlayer: Record<string, number> = {};
    for (const p of players) {
      creditsByPlayer[p.id] = winners.includes(p.id) ? reward : 0;
      result.creditsEarned[p.id] += creditsByPlayer[p.id];
    }
    result.sites.push({
      siteId: s.id,
      winnerIds: winners,
      maximum,
      creditsByPlayer,
      scrapped:
        winners.length > 1
          ? s.credits - reward * winners.length
          : winners.length
            ? 0
            : s.credits,
      outcome:
        winners.length > 1 ? "TIED" : winners.length ? "UNIQUE" : "UNCLAIMED",
    });
  }
  for (const p of players) {
    const base = number < CONFIG.rounds && !p.forfeited ? CONFIG.recharge : 0;
    const consolation =
      base && result.creditsEarned[p.id] === 0 ? CONFIG.consolation : 0;
    const remaining = p.power - result.powerSpent[p.id];
    const after = Math.min(CONFIG.maxPower, remaining + base + consolation);
    result.powerAfter[p.id] = after;
    result.recharge[p.id] = { base, consolation, applied: after - remaining };
  }
  return result;
}
export function victory(
  players: { id: string; score: number; forfeited: boolean }[],
) {
  const eligible = players.filter((p) => !p.forfeited);
  if (!eligible.length) return [];
  const high = Math.max(...eligible.map((p) => p.score));
  return eligible.filter((p) => p.score === high).map((p) => p.id);
}
