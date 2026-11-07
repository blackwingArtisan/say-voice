/**
 * The price book: the demo prices, plus the trade's past PayPal invoices if asked for, plus what
 * this browser's sent invoices taught it. Worked out
 * from the jobs each time, so one visitor's prices can't change what another visitor sees, and a
 * draft can't teach it anything. Server only.
 */
import { collection } from "@/lib/store/collection";
import { isFlatLabor } from "./checks";
import { itemKey, learned, type PriceEntry } from "./price-book";
import { historyOf } from "./paypal-history";
import { SEED_PRICES } from "./sample";
import type { Job } from "./types";

const SEEDED_ON = "2026-11-01T00:00:00.000Z";

export function priceBook(visitor?: string): PriceEntry[] {
  const book = new Map<string, PriceEntry>(SEED_PRICES.map(({ name, samples }) => [itemKey(name), { id: itemKey(name), name, samples, source: "seed", updatedAt: SEEDED_ON }]));
  // The trade's past PayPal invoices, if they asked for them. Labor is left out: a flat labor line
  // there can't be told from an hourly one without the words said around it.
  const history = historyOf(visitor);
  for (const line of history?.lines.filter((l) => !/\blabou?r\b/i.test(l.name)) ?? []) {
    for (const entry of learned([...book.values()], [line], line.invoicedAt || history!.learnedAt)) book.set(entry.id, entry);
  }
  const sent = collection<Job>("jobs")
    .list()
    .filter((job) => job.status === "sent" && job.visitor === visitor)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const job of sent) {
    const lines = job.lines.filter((line) => !isFlatLabor(line, job.transcript));
    for (const entry of learned([...book.values()], lines, job.createdAt)) book.set(entry.id, entry);
  }
  return [...book.values()].sort((a, b) => a.name.localeCompare(b.name));
}
