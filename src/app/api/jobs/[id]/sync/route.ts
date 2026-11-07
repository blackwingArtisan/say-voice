import { HttpError, route } from "@/lib/http";
import { requireJob, viewJob } from "@/lib/say/jobs";
import { syncInvoice } from "@/lib/say/paid";

/** Reads the invoice straight from PayPal, for when no webhook can reach this copy (a local run). */
export const POST = route<RouteContext<"/api/jobs/[id]/sync">>(async (_req, ctx) => {
  const job = requireJob((await ctx.params).id);
  if (!job.invoice) throw new HttpError(409, "This job has no invoice yet.", "conflict");
  return viewJob((await syncInvoice(job.invoice.id)) ?? job);
});
