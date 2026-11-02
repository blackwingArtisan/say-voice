import { getContext } from "@/lib/events/bus";
import { route } from "@/lib/http";
import { viewJob } from "@/lib/say/jobs";
import { requestReminder } from "@/lib/say/remind";

/** Asks the agent for a reminder. Costs an AI call, so it counts against the AI limit. */
export const POST = route<RouteContext<"/api/jobs/[id]/remind">>(async (_req, ctx) => viewJob(await requestReminder((await ctx.params).id, getContext().channel)), { rateLimit: "ai" });
