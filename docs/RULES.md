# Rules, configuration version 1

- 2–6 humans, eight rounds, three public sites per round.
- Start with 10 power; maximum 12. Claim 0–8 drones per site. Hazardous sites cost two power per drone; others cost one. Total cost must fit current power.
- Locking is final. Draft edits remain local. No lock at the deadline means a zero plan, not submission of an unseen draft.
- Every drone costs power during resolution, including losing, tied, and below-minimum claims.
- Highest qualifying claim wins the site. Unique winner gets the base value, plus a SOLO +2 modifier if present.
- Tied top claims split only base credits: floor(value / co-winners). Leftovers are scrapped. No qualifying claim means no award.
- After rounds 1–7 recharge four power, plus one for zero credits that round, capped at twelve. A zero-credit tie or deliberate pass qualifies. No recharge after round eight.
- Highest final score wins. Equal top scores share victory; reserve power never breaks ties.
- Two consecutive deadline auto-passes cause AFK forfeit. A deliberate zero lock resets this counter. Explicit leaving or 90 seconds disconnected also forfeits. A forfeited captain cannot win.
- If fewer than two captains remain eligible, cancel the unresolved round without charging reserved bids. One eligible captain receives a separately labeled last-captain-standing result; zero eligible captains means an abort.
- With at least two eligible captains, a forfeited captain’s prior accepted lock still costs power, but earns no credits or recharge.

Timing: three-second launch; 35-second first planning, 25 seconds thereafter; ten-second minimum planning even when everyone locks; eight-second reveal, four-second summary. Server timestamps govern everything. Typical matches take roughly 3–5 minutes depending on how quickly captains lock.

Rounds 1–2 contain only plain sites. Later rounds have one low-, medium-, and high-tier site, at most one hazard and two modified sites. A seeded draw pool tracks used templates per tier and avoids immediate repeats whenever eligible alternatives exist. Seed and future deck are server-only. Draw constraints can force plain fallbacks/pool refill without changing rules.

Future disabled ability definitions (documentation only): Rigger — once reduce one drone’s power cost by one; Surveyor — once see next public sites early; Recycler — once add two recharge power within the cap. None are active or implemented in launch rules.
