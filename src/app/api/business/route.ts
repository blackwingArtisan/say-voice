import { z } from "zod";
import { appConfig } from "@/app.config";
import { HttpError, readJson, route } from "@/lib/http";
import { businessOf, setTradeName, TRADE_NAME_MAX } from "@/lib/say/business";
import { visitorOf } from "@/lib/say/visitor";

const view = (visitor?: string) => {
  const own = businessOf(visitor)?.tradeName;
  return { tradeName: own ?? appConfig.tradeName, own: !!own, demoName: appConfig.tradeName, max: TRADE_NAME_MAX };
};

/** The name on this browser's invoices: its own once set, the demo trade's until then. */
export const GET = route(async (req) => view(visitorOf(req)));

const Body = z.object({ tradeName: z.string().max(500) });

/** Sets this browser's trade name. Empty goes back to the demo name. */
export const PUT = route(async (req) => {
  const visitor = visitorOf(req);
  if (!visitor) throw new HttpError(400, "Reload the page, then save the name again.");
  setTradeName(visitor, (await readJson(req, Body)).tradeName);
  return view(visitor);
});
