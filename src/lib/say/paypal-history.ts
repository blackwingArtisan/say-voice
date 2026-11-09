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
import { sentByApp } from "./app-memo";
import type { Job } from "./types";

export const HISTORY_LIMIT = 20;
/**
 * PayPal lists the newest invoices first, a page at a time. Every invoice this app sends sits on
 * top of the trade's history (and is skipped), so after a few hundred sends the history is pages
 * down: listing is cheap, so it looks that far, and stops once it has enough to read.
 */
const PAGE_SIZE = 100;
export const MAX_PAGES = 20;
/** At most this many full reads per click. */
const MAX_READS = 40;
const COUNTED = new Set(["SENT", "UNPAID", "PARTIALLY_PAID", "PAID", "MARKED_AS_PAID"]);

export interface PayPalHistory {
  id: string;
  visitor?: string;
  learnedAt: string;
  invoiceIds: string[];
  lines: { name: string; unitCents: number; invoicedAt: string }[];
}

const histories = () => collection<PayPalHistory>("paypal-history");
const keyOf = (visitor?: string) => `h_${visitor ?? "anyone"}`;

export const historyOf = (visitor?: string) => histories().get(keyOf(visitor)) ?? null;

/**
 * The history a visitor's book uses: their own once they've pressed Learn, the trade's shared one
 * until then. Both come from the same PayPal account; only the time they were read differs.
 */
export const tradeHistoryFor = (visitor?: string) => historyOf(visitor) ?? historyOf(undefined);

let learning = false;
let lastFailure = 0;
const RETRY_MS = 60_000;

/** Reads the trade's history once in the background, so a first visit's book already comes from PayPal. */
export function kickTradeHistory() {
  if (learning || historyOf(undefined) || Date.now() - lastFailure < RETRY_MS) return;
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
  for (let i = 0; i < candidates.length && ours.length < HISTORY_LIMIT; i += 8) {
    const read = await Promise.all(candidates.slice(i, i + 8).map((summary) => (summary.items?.length && summary.invoicer ? summary : paypal.invoicing.get(summary.id))));
    ours.push(...read.filter((invoice) => invoice.invoicer?.business_name === appConfig.tradeName && !sentByApp(invoice)));
  }
  // The newest by the invoice's own date, then oldest first, so the newest price is the last sample.
  const kept = ours.sort((a, b) => dateOf(b).localeCompare(dateOf(a))).slice(0, HISTORY_LIMIT).reverse();
  return histories().upsert({
    id: keyOf(visitor),
    visitor,
    learnedAt: new Date().toISOString(),
    invoiceIds: kept.map((inv) => inv.id),
    lines: kept.flatMap((inv) => (inv.items ?? []).map((item) => ({ name: item.name, unitCents: toMinor(item.unit_amount.value, "USD"), invoicedAt: dateOf(inv) }))),
  });
}
