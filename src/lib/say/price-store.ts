/**
 * The price book: the demo prices, then the trade's past PayPal invoices over them, plus what
 * this browser's sent invoices taught it. Worked out
 * from the jobs each time, so one visitor's prices can't change what another visitor sees, and a
 * draft can't teach it anything. Server only.
 */
import { collection } from "@/lib/store/collection";
import { isFlatLabor } from "./checks";
import { findEntry, itemKey, learned, type PriceEntry } from "./price-book";
import { tradeHistoryFor } from "./paypal-history";
import { SEED_PRICES } from "./sample";
import type { Job } from "./types";

const SEEDED_ON = "2026-11-01T00:00:00.000Z";

export function priceBook(visitor?: string): PriceEntry[] {
  const book = new Map<string, PriceEntry>(SEED_PRICES.map(({ name, samples }) => [itemKey(name), { id: itemKey(name), name, samples, source: "seed", updatedAt: SEEDED_ON }]));
  // The trade's past PayPal invoices, if they asked for them. Their prices replace the demo ones for
  // the items they have. Labor is left out: a flat labor line there can't be told from an hourly one
  // without the words said around it.
  const history = tradeHistoryFor(visitor);
  const fromPayPal = new Map<string, PriceEntry>();
  for (const line of history?.lines.filter((l) => !/\blabou?r\b/i.test(l.name)) ?? []) {
    const when = line.invoicedAt || history!.learnedAt;
    const known = fromPayPal.get(itemKey(line.name)) ?? findEntry(line.name, [...fromPayPal.values()]);
    const seed = known ? undefined : findEntry(line.name, [...book.values()]);
    const base: PriceEntry[] = known ? [known] : seed ? [{ ...seed, samples: [] }] : [];
    for (const entry of learned(base, [line], when)) {
      const next: PriceEntry = { ...entry, source: "learned", paypal: { invoices: (known?.paypal?.invoices ?? 0) + 1, lastCents: line.unitCents, lastAt: when } };
      fromPayPal.set(next.id, next);
      book.set(next.id, next);
    }
  }
  const sent = collection<Job>("jobs")
    .list()
    .filter((job) => job.status === "sent" && job.visitor === visitor && !job.example)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const job of sent) {
    const lines = job.lines.filter((line) => !isFlatLabor(line, job.transcript));
    for (const entry of learned([...book.values()], lines, job.createdAt)) book.set(entry.id, { ...entry, sentHere: (entry.sentHere ?? 0) + 1 });
  }
  return [...book.values()].sort((a, b) => a.name.localeCompare(b.name));
}
