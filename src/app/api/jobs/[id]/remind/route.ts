import { z } from "zod";
import { getContext } from "@/lib/events/bus";
import { readJson, route } from "@/lib/http";
import { viewJob } from "@/lib/say/jobs";
import { requestReminder } from "@/lib/say/remind";

/** Asks the agent for a reminder. Costs an AI call, so it counts against the AI limit. */
const Body = z.object({ ask: z.string().max(200).optional() });

/** `ask` is something the person wants added. Code still checks every figure against PayPal's invoice. */
export const POST = route<RouteContext<"/api/jobs/[id]/remind">>(async (req, ctx) => viewJob(await requestReminder((await ctx.params).id, getContext().channel, (await readJson(req, Body)).ask)), { rateLimit: "ai" });
