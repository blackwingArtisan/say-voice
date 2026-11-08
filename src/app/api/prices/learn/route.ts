import { withContext } from "@/lib/events/bus";
import { route } from "@/lib/http";
import { learnFromPayPal } from "@/lib/say/paypal-history";
import { priceBook } from "@/lib/say/price-store";
import { visitorOf } from "@/lib/say/visitor";

/**
 * Reads the trade's last invoices from PayPal into this browser's price book. Its PayPal reads (one
 * list, up to 40 gets) go on their own channel, so a job's "What happened" shows only that job.
 */
export const POST = route(async (req) => {
  const visitor = visitorOf(req);
  const history = await withContext({ channel: `prices:${visitor ?? "shared"}` }, () => learnFromPayPal(visitor));
  return { prices: priceBook(visitor), history: { invoices: history.invoiceIds.length, learnedAt: history.learnedAt, own: !!visitor } };
});
