"use client";

import { CheckCircle2, ExternalLink } from "lucide-react";
import { ButtonLink, Card, CardBody, StatusPill } from "@/components/ui";
import { computeTotals, formatCents, formatQuantity } from "@/lib/say/money";
import { isPaid, type JobView, type SentInvoice } from "@/lib/say/types";

const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function PaidBanner({ invoice, customer }: { invoice: SentInvoice; customer: string }) {
  const byHand = invoice.status === "MARKED_AS_PAID";
  return (
    <div className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900" data-testid="paid-banner">
      <p className="text-lg font-semibold">{byHand ? "Marked as paid" : `Paid: ${formatCents(invoice.paidCents ?? invoice.totalCents)} from ${customer}`}</p>
      <p className="mt-0.5 text-sm">{byHand ? "Someone recorded this by hand. No money came through PayPal." : "PayPal says the money came in."}</p>
      {invoice.paymentId ? <p className="mt-1 break-all font-mono text-xs" data-testid="payment-id">{invoice.paymentId}</p> : null}
    </div>
  );
}

export function Result({ job, invoice, showLink }: { job: JobView; invoice: SentInvoice; showLink: boolean }) {
  const totals = computeTotals(job.lines, job.taxRateMilli);
  return (
    <Card data-testid="result">
      <CardBody className="space-y-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-1 size-7 shrink-0 text-emerald-600" />
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950" data-testid="result-headline">
              Invoice {invoice.number} sent to {job.customer.name}
            </h2>
            <p className="mt-1 text-sm text-zinc-500" data-testid="readback">
              Read back from PayPal at {new Date(invoice.readAt).toLocaleTimeString("en-US")}.
            </p>
          </div>
        </div>
        {isPaid(invoice) ? <PaidBanner invoice={invoice} customer={job.customer.name} /> : null}
        <dl className="grid gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Invoice number</dt>
            <dd className="mt-1 font-mono text-lg font-semibold text-zinc-900" data-testid="invoice-number">{invoice.number}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Status</dt>
            <dd className="mt-1" data-testid="invoice-status"><StatusPill status={invoice.status} /></dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-zinc-900" data-testid="invoice-amount">{formatCents(invoice.totalCents)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Due</dt>
            <dd className="mt-1 text-lg font-semibold text-zinc-900" data-testid="invoice-due">{invoice.dueDate ? longDate(invoice.dueDate) : "On receipt"}</dd>
          </div>
        </dl>
        {invoice.note ? (
          <p className="whitespace-pre-line rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-800" data-testid="result-note">
            {invoice.note}
          </p>
        ) : null}
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
          {job.lines.map((line, i) => (
            <li key={line.key} className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-2 text-sm">
              <span className="font-medium text-zinc-900">{line.name}</span>
              <span className="ml-auto font-mono text-xs text-zinc-500">{formatQuantity(line.quantityMilli)} × {formatCents(line.unitCents)}</span>
              <span className="w-24 text-right font-mono tabular-nums text-zinc-900">{formatCents(totals.lines[i].lineCents)}</span>
              {line.description ? <span className="basis-full text-zinc-500" data-testid="result-description">{line.description}</span> : null}
            </li>
          ))}
          {totals.taxCents ? (
            <li className="flex justify-between px-4 py-2 text-sm text-zinc-600">
              <span>Tax</span>
              <span className="font-mono tabular-nums">{formatCents(totals.taxCents)}</span>
            </li>
          ) : null}
        </ul>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/jobs" data-testid="next-job">Start the next job</ButtonLink>
          {showLink && invoice.payerUrl ? (
            <a href={invoice.payerUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50" data-testid="payer-link">
              Open what the customer sees <ExternalLink className="size-4" />
            </a>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
