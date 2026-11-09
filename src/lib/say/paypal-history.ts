/**
 * The price book can start from the trade's own past invoices on PayPal (GET /v2/invoicing/invoices),
 * so a first-day user isn't stuck with demo prices. Only invoices from this trade name count: the
 * sandbox account is shared with other apps. Invoices sent with this app carry its private memo and
 * are skipped: a browser's own sends reach its book from its jobs, and other visitors' jobs aren't
 * the trade's history. Code reads the prices; no AI is involved. Server only.
 */
import { appConfig } from "@/app.config";
import { withContext } from "@/lib/events/bus";
import { toMinor } from "@/lib/money";
import { getPayPal } from "@/lib/paypal";
import type { Invoice } from "@/lib/paypal/types";
import { collection } from "@/lib/store/collection";
import { seedPastInvoices, type HistoryManifest } from "@/lib/demo/past-invoices";
import { sentByApp, sentByAppBeforeMemo } from "./app-memo";
import { OWNER_LINE_NAME } from "./reminder-rules";
import type { Job } from "./types";

export const HISTORY_LIMIT = 25;
/**
 * PayPal lists the newest invoices first, a page at a time. Every invoice this app sends sits on
 * top of the trade's history (and is skipped), so after a few hundred sends the history is pages
 * down: listing is cheap, so it looks that far, and stops once it has enough to read.
 */
const PAGE_SIZE = 100;
export const MAX_PAGES = 20;
/**
 * At most this many full reads per click. The shared sandbox has well over a hundred unmarked sends
 * (other apps, and this one's before the memo) on top of the trade's history, and PayPal's list
 * doesn't say whose an invoice is, so it reads that far, ten at a time, and stops once it has enough.
 */
const MAX_READS = 240;
const READ_BATCH = 10;
const COUNTED = new Set(["SENT", "UNPAID", "PARTIALLY_PAID", "PAID", "MARKED_AS_PAID"]);

/**
 * Not a price for the book: the lines the person adds through this app (a late fee, a deposit), and
 * names too general to say what was sold (a lump of "Material" isn't a part with a usual price).
 */
const OWNER_LINES = new Set(Object.values(OWNER_LINE_NAME).map((name) => name.toLowerCase()));
const GENERIC = /^(materials?|parts?|supplies|labou?r|misc(ellaneous)?|other|items?|fees?|services?|charges?)$/i;
export const isPricedItem = (name: string) => !OWNER_LINES.has(name.trim().toLowerCase()) && !GENERIC.test(name.trim());

/** Bumped when what counts as history changes, so a history read under the old rules is read again. */
export const HISTORY_RULES = 3;

export interface PayPalHistory {
  id: string;
  /** Missing on a history read under the first rules. */
  rules?: number;
  visitor?: string;
  learnedAt: string;
  invoiceIds: string[];
  /** quantityMilli: missing on a history read before quantities were kept. */
  lines: { name: string; unitCents: number; quantityMilli?: number; invoicedAt: string }[];
}

const histories = () => collection<PayPalHistory>("paypal-history");
const keyOf = (visitor?: string) => `h_${visitor ?? "anyone"}`;

export const historyOf = (visitor?: string) => histories().get(keyOf(visitor)) ?? null;

/**
 * The history a visitor's book uses: their own once they've pressed Learn, the trade's shared one
 * until then. Both come from the same PayPal account; only the time they were read differs.
 */
export const tradeHistoryFor = (visitor?: string) => {
  const mine = historyOf(visitor);
  return mine && mine.rules === HISTORY_RULES ? mine : historyOf(undefined);
};

let learning = false;
let lastFailure = 0;
const RETRY_MS = 60_000;

/** Reads the trade's history once in the background, so a first visit's book already comes from PayPal. */
export function kickTradeHistory() {
  // A history read under older rules (before quantities, or before the app's unmarked sends and
  // owner lines were left out) is read again, once.
  const known = historyOf(undefined);
  if (learning || (known && known.rules === HISTORY_RULES) || Date.now() - lastFailure < RETRY_MS) return;
  learning = true;
  void withContext({ channel: "prices:shared" }, () => learnFromPayPal(undefined))
    .catch((e: unknown) => {
      lastFailure = Date.now();
      console.error(`The trade's PayPal history wasn't read: ${e instanceof Error ? e.message : String(e)}`);
    })
    .finally(() => {
      learning = false;
    });
}

/** Mock PayPal starts empty, so the demo trade's past invoices are put there the first time they're asked for. */
async function mockHistory() {
  const paypal = getPayPal();
  if (paypal.mode !== "mock") return;
  const manifests = collection<{ id: string; ids: HistoryManifest }>("past-invoices-mock");
  const manifest = { ...manifests.get("mock")?.ids };
  await seedPastInvoices(paypal, manifest);
  manifests.upsert({ id: "mock", ids: manifest });
}

/** PayPal's quantity is a decimal string: "1", "1.5". */
const quantityMilli = (quantity: string | undefined) => {
  const n = Number(quantity ?? "1");
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : undefined;
};

const dateOf = (inv: Invoice) => inv.detail.invoice_date ?? inv.detail.metadata?.create_time?.slice(0, 10) ?? "";

/** Reads the newest invoices from PayPal and keeps this trade's last HISTORY_LIMIT. */
export async function learnFromPayPal(visitor?: string): Promise<PayPalHistory> {
  await mockHistory();
  const paypal = getPayPal();
  const own = new Set(collection<Job>("jobs").list().flatMap((j) => (j.invoice ? [j.invoice.id] : [])));
  const listed: Invoice[] = [];
  for (let page = 1; page <= MAX_PAGES && listed.length < MAX_READS; page++) {
    const { items } = await paypal.invoicing.list({ page, page_size: PAGE_SIZE });
    listed.push(...items.filter((inv) => COUNTED.has(inv.status) && !own.has(inv.id) && !sentByApp(inv)));
    if (items.length < PAGE_SIZE) break;
  }
  // PayPal's list has no items or invoicer, so each one is read in full, a few at a time, newest first.
  const ours: Invoice[] = [];
  const candidates = listed.slice(0, MAX_READS);
  for (let i = 0; i < candidates.length && ours.length < HISTORY_LIMIT; i += READ_BATCH) {
    const read = await Promise.all(candidates.slice(i, i + READ_BATCH).map((summary) => (summary.items?.length && summary.invoicer ? summary : paypal.invoicing.get(summary.id))));
    ours.push(...read.filter((invoice) => invoice.invoicer?.business_name === appConfig.tradeName && !sentByApp(invoice) && !sentByAppBeforeMemo(invoice)));
  }
  // The newest by the invoice's own date, then oldest first, so the newest price is the last sample.
  const kept = ours.sort((a, b) => dateOf(b).localeCompare(dateOf(a))).slice(0, HISTORY_LIMIT).reverse();
  return histories().upsert({
    id: keyOf(visitor),
    rules: HISTORY_RULES,
    visitor,
    learnedAt: new Date().toISOString(),
    invoiceIds: kept.map((inv) => inv.id),
    lines: kept.flatMap((inv) => (inv.items ?? []).filter((item) => isPricedItem(item.name)).map((item) => ({ name: item.name, unitCents: toMinor(item.unit_amount.value, "USD"), quantityMilli: quantityMilli(item.quantity), invoicedAt: dateOf(inv) }))),
  });
}
