import { route } from "@/lib/http";
import { historyOf } from "@/lib/say/paypal-history";
import { priceBook } from "@/lib/say/price-store";
import { visitorOf } from "@/lib/say/visitor";

const summary = (visitor?: string) => {
  const history = historyOf(visitor);
  return history ? { invoices: history.invoiceIds.length, learnedAt: history.learnedAt } : null;
};

export const GET = route(async (req) => ({ prices: priceBook(visitorOf(req)), history: summary(visitorOf(req)) }));
