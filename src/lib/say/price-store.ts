/** The price book on disk. Server only. Seeded once, then fed by every invoice that goes out. */
import { collection } from "@/lib/store/collection";
import { itemKey, learned, type PriceEntry } from "./price-book";
import { SEED_PRICES } from "./sample";
import type { JobLine } from "./types";

const entries = () => collection<PriceEntry>("price-book");

export function priceBook(): PriceEntry[] {
  const store = entries();
  if (!store.list().length) {
    const now = new Date().toISOString();
    store.replaceAll(SEED_PRICES.map(({ name, samples }) => ({ id: itemKey(name), name, samples, source: "seed", updatedAt: now })));
  }
  return store.list().sort((a, b) => a.name.localeCompare(b.name));
}

/** Only prices that went out on a real invoice count, so a draft can't teach it anything. */
export function learnPrices(lines: Pick<JobLine, "name" | "unitCents">[]) {
  learned(priceBook(), lines, new Date().toISOString()).forEach((entry) => entries().upsert(entry));
}
