/**
 * The PayPal invoices behind a price: "from 9 PayPal invoices" on the confirm screen opens this
 * list, one row per invoice, with PayPal's number, its date and the price that invoice had. Each
 * row opens PayPal's own page for the invoice (sandbox), or the app's fresh read of it from PayPal.
 */
import { findEntry, itemKey, type PriceEntry } from "./price-book";
import type { PayPalHistory } from "./paypal-history";

export interface Receipt {
  id: string;
  /** PayPal's invoice number. Missing on a history read before numbers were kept. */
  number?: string;
  date: string;
  /** What this invoice charged for the item, each. */
  cents: number;
  /** PayPal's own page for it, sandbox only. */
  viewUrl?: string;
}

/** The invoices an entry's price came from, newest first, each with the price it had. */
export function receiptsFor(entry: PriceEntry, history: PayPalHistory | null): Receipt[] {
  const ids = entry.paypal?.invoiceIds ?? [];
  if (!history || !ids.length) return [];
  const meta = new Map((history.invoices ?? []).map((inv) => [inv.id, inv]));
  const rows = ids.flatMap((id): Receipt[] => {
    const line = history.lines.find((l) => l.invoiceId === id && (itemKey(l.name) === entry.id || findEntry(l.name, [entry]) === entry));
    if (!line) return [];
    const inv = meta.get(id);
    return [{ id, ...(inv?.number ? { number: inv.number } : {}), date: inv?.date || line.invoicedAt, cents: line.unitCents, ...(inv?.viewUrl ? { viewUrl: inv.viewUrl } : {}) }];
  });
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

/** The phrase in a check or a price's provenance that the list hangs off: "from 9 PayPal invoices". */
export const RECEIPTS_PHRASE = /(?:from|on all) \d+ PayPal invoices?/;
