import { route } from "@/lib/http";
import { learnFromPayPal } from "@/lib/say/paypal-history";
import { priceBook } from "@/lib/say/price-store";
import { visitorOf } from "@/lib/say/visitor";

/** Reads the trade's last invoices from PayPal into this browser's price book. */
export const POST = route(async (req) => {
  const visitor = visitorOf(req);
  const history = await learnFromPayPal(visitor);
  return { prices: priceBook(visitor), history: { invoices: history.invoiceIds.length, learnedAt: history.learnedAt } };
});
