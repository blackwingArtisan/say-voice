"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import { Button, ButtonLink, Card, CardBody, StatusPill } from "@/components/ui";
import { computeTotals, formatCents, formatQuantity } from "@/lib/say/money";
import { isPaid, type JobView, type SentInvoice } from "@/lib/say/types";
import { PayNow } from "./pay-now";

const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function PaidBanner({ invoice, customer }: { invoice: SentInvoice; customer: string }) {
  const byHand = invoice.status === "MARKED_AS_PAID";
  return (
    <div className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900" data-testid="paid-banner">
      <p className="text-lg font-semibold">{byHand ? "Marked as paid" : `Paid: ${formatCents(invoice.paidCents ?? invoice.totalCents)} from ${customer}`}</p>
      <p className="mt-0.5 text-sm" data-testid="paid-source" title={invoice.paidEventId ? `PayPal event ${invoice.paidEventId}` : undefined}>
        {byHand ? "Someone recorded this by hand. No money came through PayPal." : invoice.paidEventId ? "PayPal told the app the moment it was paid, and a fresh read from PayPal agrees." : "Read straight from PayPal: the invoice is paid."}
      </p>
      {invoice.paymentId ? (
        <p className="mt-1 break-all text-xs">
          PayPal transaction id <span className="font-mono font-semibold" data-testid="payment-id">{invoice.paymentId}</span>
        </p>
      ) : null}
    </div>
  );
}

export function Result({ job, invoice, showLink, onCheck }: { job: JobView; invoice: SentInvoice; showLink: boolean; onCheck?: () => Promise<void> }) {
  const [checking, setChecking] = useState(false);
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
              {invoice.businessName ? <> From <span className="font-medium text-zinc-700" data-testid="invoice-from">{invoice.businessName}</span>.</> : null}
            </p>
          </div>
        </div>
        {isPaid(invoice) ? <PaidBanner invoice={invoice} customer={job.customer.name} /> : null}
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
        {/* The QR comes before the details: the customer is standing there. */}
        {showLink && invoice.payerUrl && !isPaid(invoice) ? <PayNow url={invoice.payerUrl} dueCents={invoice.dueCents} customer={job.customer.name} /> : null}
        {invoice.note ? (
          <p className="whitespace-pre-line rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-800" data-testid="result-note">
            {invoice.note}
          </p>
        ) : null}
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
          {job.lines.map((line, i) => (
            <li key={line.key} className="px-4 py-2 text-sm" data-testid="result-line">
              <div className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 break-words font-medium text-zinc-900">{line.name}</span>
                <span className="shrink-0 text-right font-mono tabular-nums text-zinc-900" data-testid="result-line-amount">{formatCents(totals.lines[i].lineCents)}</span>
              </div>
              <p className="font-mono text-xs text-zinc-500">{formatQuantity(line.quantityMilli)} × {formatCents(line.unitCents)}</p>
              {line.description ? <p className="mt-0.5 text-zinc-500" data-testid="result-description">{line.description}</p> : null}
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
          {showLink && invoice.payerUrl && isPaid(invoice) ? (
            <a href={invoice.payerUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50" data-testid="payer-link">
              Open what the customer sees <ExternalLink className="size-4" />
            </a>
          ) : null}
          {onCheck && !isPaid(invoice) ? (
            <Button variant="secondary" icon={<RefreshCw className="size-4" />} loading={checking} onClick={() => { setChecking(true); void onCheck().finally(() => setChecking(false)); }} data-testid="check-payment">
              Check payment with PayPal
            </Button>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
