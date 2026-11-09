"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useKit } from "@/components/kit/kit-provider";
import { cn } from "@/components/ui/cn";
import { formatCents } from "@/lib/say/money";
import { RECEIPTS_PHRASE, type Receipt } from "@/lib/say/receipts";

/** "Aug 14, 2026" */
const day = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : iso);

/**
 * A check's text with "from 9 PayPal invoices" as a tap that lists those invoices: PayPal's number,
 * the date and the price each had, each opening PayPal's own page for it (sandbox) or the app's
 * fresh read of it from PayPal. Inline, so it sits inside the check's sentence.
 */
export function WithReceipts({ text, item }: { text: string; item: string }) {
  const { kitFetch } = useKit();
  const [open, setOpen] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const match = RECEIPTS_PHRASE.exec(text);
  if (!match) return <>{text}</>;
  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);

  function toggle() {
    setOpen(!open);
    if (receipts || open) return;
    kitFetch<{ receipts: Receipt[] }>(`/api/prices/receipts?item=${encodeURIComponent(item)}`)
      .then((r) => setReceipts(r.receipts))
      .catch((e: Error) => setError(e.message));
  }

  return (
    <>
      {before}
      <button type="button" className="inline-flex items-center gap-0.5 font-semibold underline decoration-dotted underline-offset-2" aria-expanded={open} onClick={toggle} data-testid="receipts-open">
        {match[0]}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {after}
      {open ? (
        <span className="mt-2 block rounded-md border border-current/15 bg-white/70 p-2 text-zinc-800" data-testid="receipts">
          <span className="mb-1 block font-mono text-[11px] text-sky-800">GET /v2/invoicing/invoices</span>
          {error ? (
            <span className="block text-red-700">{error}</span>
          ) : !receipts ? (
            <span className="block text-zinc-500">Reading the list...</span>
          ) : !receipts.length ? (
            <span className="block text-zinc-500">None of the invoices read has this item.</span>
          ) : (
            <span role="list" className="block divide-y divide-zinc-200">
              {receipts.map((r) => (
                <span role="listitem" key={r.id} className="block py-1" data-testid="receipt" data-invoice-id={r.id}>
                  <a className="flex items-center gap-2 hover:underline" href={r.viewUrl ?? `/api/prices/receipts/${r.id}`} target="_blank" rel="noreferrer">
                    <span className="font-mono tabular-nums" data-testid="receipt-number">{r.number ? `#${r.number}` : r.id}</span>
                    <span className="text-zinc-500">{day(r.date)}</span>
                    <span className="ml-auto font-mono tabular-nums">{formatCents(r.cents)}</span>
                    <ExternalLink className="size-3.5 shrink-0 text-zinc-400" />
                  </a>
                </span>
              ))}
            </span>
          )}
        </span>
      ) : null}
    </>
  );
}
