import { route } from "@/lib/http";
import { historyOf, kickTradeHistory, tradeHistoryFor } from "@/lib/say/paypal-history";
import { priceBook } from "@/lib/say/price-store";
import { visitorOf } from "@/lib/say/visitor";

/** Which PayPal read the book stands on: this browser's own Learn, or the trade's shared one. */
const summary = (visitor?: string) => {
  const mine = visitor ? historyOf(visitor) : null;
  const history = mine ?? tradeHistoryFor(visitor);
  return history ? { invoices: history.invoiceIds.length, learnedAt: history.learnedAt, own: !!mine } : null;
};

export const GET = route(async (req) => {
  kickTradeHistory();
  return { prices: priceBook(visitorOf(req)), history: summary(visitorOf(req)) };
});
