import type { SHIPS } from "./config.js";
export type Ship = (typeof SHIPS)[number];
export type Phase =
  | "LOBBY"
  | "STARTING"
  | "PLANNING"
  | "REVEAL"
  | "SUMMARY"
  | "RESULTS";
export type Tier = "low" | "medium" | "high";
export interface Site {
  id: string;
  templateId: string;
  name: string;
  tier: Tier;
  credits: number;
  minimum: number;
  cost: number;
  bonus: number;
  flavor: string;
}
export interface Bid {
  siteId: string;
  drones: number;
}
export interface Plan {
  requestId: string;
  matchId: string;
  roundId: string;
  bids: Bid[];
}
export interface PlayerView {
  id: string;
  name: string;
  shipId: Ship;
  identitySlot: number;
  connected: boolean;
  ready: boolean;
  forfeited: boolean;
  forfeitedReason?: string;
  score: number;
  power: number;
  roundsMissed: number;
  stats: { sitesWon: number; sitesCoWon: number; powerSpent: number };
}
export interface SiteResult {
  siteId: string;
  winnerIds: string[];
  maximum: number | null;
  creditsByPlayer: Record<string, number>;
  scrapped: number;
  outcome: "UNCLAIMED" | "UNIQUE" | "TIED";
}
export interface ResolvedPlan {
  playerId: string;
  bids: Bid[];
  source: "PLAYER" | "TIMEOUT" | "FORFEIT";
}
export interface RoundResult {
  roundId: string;
  number: number;
  sites: SiteResult[];
  allocations: ResolvedPlan[];
  creditsEarned: Record<string, number>;
  powerSpent: Record<string, number>;
  powerAfter: Record<string, number>;
  recharge: Record<
    string,
    { base: number; consolation: number; applied: number }
  >;
}
export interface Envelope {
  protocolVersion: 1;
  serverNow: number;
  public: {
    code: string;
    revision: number;
    phase: Phase;
    hostId: string | null;
    players: PlayerView[];
    match?: {
      id: string;
      roundId?: string;
      roundNumber: number;
      sites: Site[];
      lockedPlayerIds: string[];
      phaseStartedAt: number;
      phaseEndsAt: number;
      earliestRevealAt?: number;
      lastResolution?: RoundResult;
      winnerIds?: string[];
      endReason?: "NORMAL" | "LAST_CAPTAIN" | "ALL_LEFT";
    };
  };
  private: { playerId: string; lockedAllocation?: Plan };
}
export type Ack =
  | {
      ok: true;
      requestId: string;
      revision: number;
      data?: {
        code?: string;
        resumeToken?: string;
        playerId?: string;
        serverNow?: number;
      };
    }
  | { ok: false; requestId: string; code: string; message: string };
