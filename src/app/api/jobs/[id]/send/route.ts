import { z } from "zod";
import { getContext } from "@/lib/events/bus";
import { readJson, route } from "@/lib/http";
import { viewJob } from "@/lib/say/jobs";
import { MAX_QUANTITY_MILLI, MAX_TAX_RATE_MILLI, MAX_UNIT_CENTS } from "@/lib/say/money";
import { requestSend } from "@/lib/say/send";
import { MAX_DESCRIPTION, MAX_SITE, MAX_SUMMARY } from "@/lib/say/wording";

const Line = z.object({
  key: z.string().min(1).max(40),
  name: z.string().trim().min(1, "Every item needs a name.").max(200),
  quantityMilli: z.number().int().positive().max(MAX_QUANTITY_MILLI),
  unitCents: z.number().int().positive().max(MAX_UNIT_CENTS),
  description: z.string().trim().max(MAX_DESCRIPTION).default(""),
  taxed: z.boolean().default(true),
});

const Body = z.object({
  customer: z.object({ name: z.string().trim().min(1).max(140), email: z.string().trim().email() }),
  lines: z.array(Line).min(1).max(50),
  taxRateMilli: z.number().int().min(0).max(MAX_TAX_RATE_MILLI),
  details: z
    .object({
      summary: z.string().trim().max(MAX_SUMMARY),
      site: z.string().trim().max(MAX_SITE),
      serviceDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
    })
    .default({ summary: "", site: "", serviceDate: "" }),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  acknowledged: z.array(z.string().max(80)).max(100).default([]),
});

/** Saves the person's edits and asks for approval. Totals and open checks are worked out again here. */
export const POST = route<RouteContext<"/api/jobs/[id]/send">>(async (req, ctx) => {
  const checked = await readJson(req, Body);
  return viewJob(requestSend((await ctx.params).id, checked, getContext().channel).job);
});
