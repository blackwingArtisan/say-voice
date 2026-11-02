/**
 * The price book: the demo prices, plus what this browser's sent invoices taught it. Worked out
 * from the jobs each time, so one visitor's prices can't change what another visitor sees, and a
 * draft can't teach it anything. Server only.
 */
import { collection } from "@/lib/store/collection";
import { isFlatLabor } from "./checks";
import { itemKey, learned, type PriceEntry } from "./price-book";
import { SEED_PRICES } from "./sample";
import type { Job } from "./types";

const SEEDED_ON = "2026-11-01T00:00:00.000Z";

export function priceBook(visitor?: string): PriceEntry[] {
  const book = new Map<string, PriceEntry>(SEED_PRICES.map(({ name, samples }) => [itemKey(name), { id: itemKey(name), name, samples, source: "seed", updatedAt: SEEDED_ON }]));
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
