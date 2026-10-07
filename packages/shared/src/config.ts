export const BRAND = {
  title: "Salvage Rights",
  pitch: "Outbid your friends for space junk.",
};
export const CONFIG = {
  version: 1,
  rounds: 8,
  sites: 3,
  startPower: 10,
  maxPower: 12,
  maxBid: 8,
  recharge: 4,
  consolation: 1,
  minPlayers: 2,
  maxPlayers: 6,
  timing: {
    starting: 3000,
    firstPlanning: 35000,
    planning: 25000,
    minimumPlanning: 10000,
    reveal: 8000,
    summary: 4000,
  },
  lobbyGrace: 60000,
  matchGrace: 90000,
  lobbyIdle: 1200000,
  lobbyHard: 7200000,
  resultsIdle: 900000,
  maxRooms: 100,
  maxPlayersTotal: 600,
};
export type Timing = typeof CONFIG.timing;
export const SHIPS = ["tug", "courier", "barge", "survey"] as const;
export const COLORS = [
  "#75D5D0",
  "#FFB14A",
  "#C4ABFF",
  "#F47C72",
  "#A8D18D",
  "#E8E3D5",
];
