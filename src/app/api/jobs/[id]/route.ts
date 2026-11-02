import { route } from "@/lib/http";
import { requireJob, viewJob } from "@/lib/say/jobs";

export const GET = route<RouteContext<"/api/jobs/[id]">>(async (_req, ctx) => viewJob(requireJob((await ctx.params).id)));
