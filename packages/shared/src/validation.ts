import { z } from "zod";
import { SHIPS } from "./config.js";
export const requestId = z.string().uuid();
export const callsign = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .refine(
    (s) => !/[\p{Cc}\p{Cf}<>]/u.test(s),
    "Use 2–16 visible characters without markup.",
  );
const basic = { requestId };
export const schemas = {
  "room:create": z
    .object({ ...basic, name: callsign, shipId: z.enum(SHIPS) })
    .strict(),
  "room:join": z
    .object({
      ...basic,
      code: z.string().regex(/^[A-Z2-9]{6}$/),
      name: callsign,
      shipId: z.enum(SHIPS),
    })
    .strict(),
  "room:resume": z
    .object({
      ...basic,
      code: z.string().length(6),
      resumeToken: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  "room:leave": z.object(basic).strict(),
  "player:ready": z.object({ ...basic, ready: z.boolean() }).strict(),
  "player:update": z
    .object({
      ...basic,
      name: callsign.optional(),
      shipId: z.enum(SHIPS).optional(),
    })
    .strict(),
  "game:start": z.object(basic).strict(),
  "game:rematch": z.object(basic).strict(),
  "round:submit": z
    .object({
      ...basic,
      matchId: z.string().uuid(),
      roundId: z.string().uuid(),
      bids: z
        .array(
          z
            .object({
              siteId: z.string().uuid(),
              drones: z.number().int().min(0).max(8),
            })
            .strict(),
        )
        .length(3),
    })
    .strict(),
  "state:request": z.object(basic).strict(),
  "time:sync": z.object(basic).strict(),
};
export type Command = keyof typeof schemas;
