import { CATALOG, modified } from "./sites.js";
import type { Site, Tier } from "./types.js";
// Reproducible draws; seed and pools remain exclusively on the server.
export function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export class Deck {
  private random: () => number;
  private used = new Set<string>();
  private last: Partial<Record<Tier, string>> = {};
  constructor(seed: string) {
    this.random = seeded(seed);
  }
  draw(round: number, id: () => string): Site[] {
    let hazards = 0,
      mods = 0;
    const sites: Site[] = [];
    for (const tier of ["low", "medium", "high"] as Tier[]) {
      const allowed = CATALOG.filter(
        (s) =>
          s.tier === tier &&
          (round > 2 || !modified(s)) &&
          (hazards === 0 || s.cost === 1) &&
          (mods < 2 || !modified(s)),
      );
      let pool = allowed.filter((s) => !this.used.has(s.templateId));
      if (!pool.length) {
        for (const s of allowed) this.used.delete(s.templateId);
        pool = allowed;
      }
      const noRepeat = pool.filter((s) => s.templateId !== this.last[tier]);
      if (noRepeat.length) pool = noRepeat;
      const s =
        pool[Math.floor(this.random() * pool.length)] ??
        CATALOG.find((s) => s.tier === tier && !modified(s))!;
      this.used.add(s.templateId);
      this.last[tier] = s.templateId;
      hazards += Number(s.cost === 2);
      mods += Number(modified(s));
      sites.push({ ...s, id: id() });
    }
    for (let i = sites.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [sites[i], sites[j]] = [sites[j], sites[i]];
    }
    return sites;
  }
}
