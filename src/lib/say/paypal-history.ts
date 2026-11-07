/**
 * The price book can start from the trade's own past invoices on PayPal (GET /v2/invoicing/invoices),
 * so a first-day user isn't stuck with demo prices. Only invoices from this trade name count: the
 * sandbox account is shared with other apps. Invoices this browser sent are already in the book from
 * its jobs, so they're skipped. Code reads the prices; no AI is involved. Server only.
 */
import { appConfig } from "@/app.config";
import { toMinor } from "@/lib/money";
import { getPayPal } from "@/lib/paypal";
import type { Invoice } from "@/lib/paypal/types";
import { collection } from "@/lib/store/collection";
import type { Job } from "./types";

export const HISTORY_LIMIT = 20;
/** At most this many full reads per click. */
const MAX_READS = 30;
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

/** Reads the newest invoices from PayPal and keeps this trade's last HISTORY_LIMIT. */
export async function learnFromPayPal(visitor?: string): Promise<PayPalHistory> {
  const paypal = getPayPal();
  const own = new Set(collection<Job>("jobs").list().filter((j) => j.visitor === visitor && j.invoice).map((j) => j.invoice!.id));
  const listed = (await paypal.invoicing.list({ page: 1, page_size: 50 })).items.filter((inv) => COUNTED.has(inv.status) && !own.has(inv.id));
  // PayPal's list has no items or invoicer, so each one is read in full, a few at a time, newest first.
  const ours: Invoice[] = [];
  const candidates = listed.slice(0, MAX_READS);
  for (let i = 0; i < candidates.length && ours.length < HISTORY_LIMIT; i += 6) {
    const read = await Promise.all(candidates.slice(i, i + 6).map((summary) => (summary.items?.length && summary.invoicer ? summary : paypal.invoicing.get(summary.id))));
    ours.push(...read.filter((invoice) => invoice.invoicer?.business_name === appConfig.tradeName));
  }
  ours.splice(HISTORY_LIMIT);
  ours.reverse(); // oldest first, so the newest price is the last sample
  return histories().upsert({
    id: keyOf(visitor),
    visitor,
    learnedAt: new Date().toISOString(),
    invoiceIds: ours.map((inv) => inv.id),
    lines: ours.flatMap((inv) => (inv.items ?? []).map((item) => ({ name: item.name, unitCents: toMinor(item.unit_amount.value, "USD"), invoicedAt: inv.detail.invoice_date ?? inv.detail.metadata?.create_time ?? "" }))),
  });
}
