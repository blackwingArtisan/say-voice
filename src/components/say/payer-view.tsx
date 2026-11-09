import { ExternalLink } from "lucide-react";
import { formatCents } from "@/lib/say/money";
import type { PayerItem, SentInvoice } from "@/lib/say/types";

const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** PayPal's own line amount: its quantity times its unit price, in cents. */
export const payerLineCents = (item: PayerItem) => Math.round(Number(item.quantity) * item.unitCents);

/**
 * A small copy of the customer's PayPal invoice page, drawn from PayPal's own record of it (GET /v2/invoicing/invoices/{id}):
 * the trade name, the note, each line with its description and tax, and the total. The link opens PayPal's real page.
 */
export function PayerView({ invoice, customer, showLink }: { invoice: SentInvoice; customer: string; showLink: boolean }) {
  const items = invoice.items ?? [];
  return (
    <section className="space-y-2" data-testid="payer-view">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">What {customer} sees on PayPal</h3>
        {/* Plain words on the trade's screen; the call itself is in the tooltip and under Details. */}
        <span className="inline-flex shrink-0 items-center rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] leading-none text-sky-800" title="GET /v2/invoicing/invoices/{id}" data-testid="payer-view-source">
          Read back from PayPal
        </span>
      </div>
      <div className="rounded-xl bg-zinc-100 p-3 sm:p-4">
        <div className="mx-auto max-w-md space-y-3 rounded-lg bg-white p-4 text-sm shadow-sm ring-1 ring-zinc-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-zinc-950" data-testid="payer-view-business">{invoice.businessName ?? "Your business"}</p>
              <p className="text-xs text-zinc-500">
                Invoice #{invoice.number}
                {invoice.dueDate ? <> · Due {longDate(invoice.dueDate)}</> : null}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-zinc-500">Amount due</p>
              <p className="font-mono text-lg font-semibold tabular-nums text-zinc-950">{formatCents(invoice.dueCents)}</p>
            </div>
          </div>
          {invoice.note ? (
            <div className="rounded-md bg-zinc-50 px-3 py-2">
              <p className="text-xs font-medium text-zinc-500">Note from {invoice.businessName ?? "the seller"}</p>
              <p className="line-clamp-4 whitespace-pre-line text-zinc-800" data-testid="result-note">
                {invoice.note}
              </p>
            </div>
          ) : null}
          <ul className="divide-y divide-zinc-100 border-y border-zinc-100">
            {items.map((item, i) => (
              <li key={i} className="py-2" data-testid="result-line">
                <div className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1 break-words font-medium text-zinc-900">{item.name}</span>
                  <span className="shrink-0 text-right font-mono tabular-nums text-zinc-900" data-testid="result-line-amount">{formatCents(payerLineCents(item))}</span>
                </div>
                {item.description ? <p className="mt-0.5 text-zinc-600" data-testid="result-description">{item.description}</p> : null}
                <p className="font-mono text-xs text-zinc-500">
                  {item.quantity} × {formatCents(item.unitCents)}
                  {item.taxPercent ? <span data-testid="payer-view-tax-rate"> · Tax {item.taxPercent}%</span> : null}
                </p>
              </li>
            ))}
          </ul>
          <dl className="space-y-1">
            <div className="flex justify-between text-zinc-600">
              <dt>Tax</dt>
              <dd className="font-mono tabular-nums" data-testid="payer-view-tax">{formatCents(invoice.taxCents ?? 0)}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="font-semibold text-zinc-900">Total</dt>
              <dd className="font-mono text-base font-semibold tabular-nums text-zinc-950" data-testid="payer-view-total">{formatCents(invoice.totalCents)}</dd>
            </div>
          </dl>
        </div>
      </div>
      {showLink && invoice.payerUrl ? (
        <a href={invoice.payerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 underline underline-offset-2" data-testid="payer-view-link">
          Open PayPal&apos;s own page <ExternalLink className="size-3.5" />
        </a>
      ) : null}
    </section>
  );
}
