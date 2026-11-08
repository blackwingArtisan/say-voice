import { z } from "zod";
import { getContext } from "@/lib/events/bus";
import { readJson, route } from "@/lib/http";
import { viewJob } from "@/lib/say/jobs";
import { parseDollars } from "@/lib/say/money";
import { requestReminder } from "@/lib/say/remind";
import { HttpError } from "@/lib/http";

/** Asks the agent for a reminder. Costs an AI call, so it counts against the AI limit. */
const Body = z.object({
  ask: z.string().max(200).optional(),
  /** A late fee or a deposit already paid. Only the person can add one; code puts it on PayPal's invoice first. */
  ownerLine: z.object({ kind: z.enum(["late_fee", "deposit"]), amount: z.string().max(20) }).optional(),
});

function ownerLineOf(line: z.infer<typeof Body>["ownerLine"]) {
  if (!line) return undefined;
  const cents = parseDollars(line.amount.replace(/^\$/, "").trim());
  if (cents === null) throw new HttpError(422, "Enter the amount as dollars and cents, like 25 or 25.00.", "invalid_request");
  return { kind: line.kind, cents };
}

/** `ask` is something the person wants added. Code still checks every figure against PayPal's invoice. */
export const POST = route<RouteContext<"/api/jobs/[id]/remind">>(
  async (req, ctx) => {
    const body = await readJson(req, Body);
    return viewJob(await requestReminder((await ctx.params).id, getContext().channel, body.ask, ownerLineOf(body.ownerLine)));
  },
  { rateLimit: "ai" },
);
