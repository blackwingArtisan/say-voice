import { z } from "zod";
import { appConfig } from "@/app.config";
import { HttpError, readJson, route } from "@/lib/http";
import { businessOf, ContactProblem, isFirstRun, setBusiness, TRADE_NAME_MAX } from "@/lib/say/business";
import { visitorOf } from "@/lib/say/visitor";

const view = (visitor?: string) => {
  const business = businessOf(visitor);
  const own = business?.tradeName;
  return { tradeName: own ?? appConfig.tradeName, own: !!own, demoName: appConfig.tradeName, max: TRADE_NAME_MAX, email: business?.email ?? null, firstRun: isFirstRun(visitor) };
};

/** The name on this browser's invoices: its own once set, the demo trade's until then. firstRun: nothing set or skipped yet. */
export const GET = route(async (req) => view(visitorOf(req)));

const Body = z.object({ tradeName: z.string().max(500).optional(), email: z.string().max(500).optional(), skip: z.boolean().optional() });

/** Sets this browser's trade name and email, or skips the first-run step. An empty name goes back to the demo name. */
export const PUT = route(async (req) => {
  const visitor = visitorOf(req);
  if (!visitor) throw new HttpError(400, "Reload the page, then save the name again.");
  try {
    setBusiness(visitor, await readJson(req, Body));
  } catch (e) {
    if (e instanceof ContactProblem) throw new HttpError(400, e.message);
    throw e;
  }
  return view(visitor);
});
