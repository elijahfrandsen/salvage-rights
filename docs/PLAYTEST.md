# First human playtests

Automated tests verify implementation; they do not measure whether the game is fun. No human friend playtest has been conducted yet.

Run one session each with 2, 4 and 6 friends. Explain only the in-game briefing, then observe:

- Can everyone state why losing drones still cost power?
- Is minimum-claim / double-power / solo bonus clear?
- Does anyone intentionally save power or split speculative claims?
- Can they predict a tie and explain scrapped credits?
- Can a poor round leave a useful next move?
- Does someone reconnect successfully during planning and reveal?
- Do they finish and voluntarily ask for a rematch?

Ask: What made you change your plan? Could you tell why you lost? Was saving worthwhile? Which choices felt obvious? Did waiting feel slow? When did you feel unable to catch up?

Record actual feedback separately from policy diagnostics in `artifacts/balance-report.json`. Mixed diagnostic policies over 300 seeds per player count showed more ties at six players (around 40% of sites) and around 36% zero-credit captain-rounds. These are harness-specific observations, not a prediction of human strategy or a reason to change the specified launch rules immediately.

Change one or two settings at a time only after useful evidence. Keep config version, seeds, player count and rules copy aligned. First investigate low-value six-player tied scrapping, dominant repeated bids, and waiting time. Never silently replace deterministic ties with random winners.
