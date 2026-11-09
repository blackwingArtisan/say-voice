import { HttpError, route } from "@/lib/http";
import { findEntry } from "@/lib/say/price-book";
import { priceBook } from "@/lib/say/price-store";
import { tradeHistoryFor } from "@/lib/say/paypal-history";
import { receiptsFor } from "@/lib/say/receipts";
import { visitorOf } from "@/lib/say/visitor";

/** The PayPal invoices an item's usual price came from: GET /api/prices/receipts?item=Heating%20element */
export const GET = route(async (req) => {
  const name = new URL(req.url).searchParams.get("item")?.trim();
  if (!name) throw new HttpError(400, "Say which item: ?item=Heating element");
  const visitor = visitorOf(req);
  const entry = findEntry(name, priceBook(visitor));
  if (!entry?.paypal) return { item: name, invoices: 0, receipts: [] };
  return { item: entry.name, invoices: entry.paypal.invoices, receipts: receiptsFor(entry, tradeHistoryFor(visitor)) };
});
