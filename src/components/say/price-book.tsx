"use client";

import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { useKit } from "@/components/kit/kit-provider";
import { PageHeader } from "@/components/shell/app-shell";
import { Badge, Button, Card, EmptyState, SkeletonCard } from "@/components/ui";
import { formatCents, formatQuantity } from "@/lib/say/money";
import { FAR_RATIO, MIN_SAMPLES, provenance, steadyQuantity, usualCents, type PriceEntry } from "@/lib/say/price-book";

/** The PayPal call a price came from, as a small chip. */
function ApiChip() {
  return (
    <span className="inline-flex items-center rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 font-mono text-[11px] leading-none text-sky-800" data-testid="price-source-chip">
      GET /v2/invoicing/invoices
    </span>
  );
}

function Row({ entry }: { entry: PriceEntry }) {
  const steady = steadyQuantity(entry);
  return (
    <li className="flex items-center gap-3 px-5 py-3" data-testid="price-row">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-zinc-900" data-testid="price-name">{entry.name}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500">
          <span data-testid="price-count">{provenance(entry)}</span>
          {steady !== null ? <span data-testid="price-qty">· {formatQuantity(steady)} on every one</span> : null}
          {entry.paypal ? <ApiChip /> : null}
        </p>
      </div>
      <Badge tone={entry.source === "seed" ? "neutral" : "brand"}>{entry.paypal ? "PayPal" : entry.source === "seed" ? "Demo start" : "Learned"}</Badge>
      <span className="w-20 text-right font-mono text-[15px] font-semibold tabular-nums text-zinc-900" data-testid="price-usual">{formatCents(usualCents(entry.samples))}</span>
    </li>
  );
}

interface History {
  invoices: number;
  learnedAt: string;
  own?: boolean;
}

export function PriceBook() {
  const { kitFetch } = useKit();
  const [prices, setPrices] = useState<PriceEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [learning, setLearning] = useState(false);

  useEffect(() => {
    kitFetch<{ prices: PriceEntry[]; history: History | null }>("/api/prices")
      .then((r) => {
        setPrices(r.prices);
        setHistory(r.history);
      })
      .catch((e: Error) => setError(e.message));
  }, [kitFetch]);

  async function learn() {
    setLearning(true);
    try {
      const r = await kitFetch<{ prices: PriceEntry[]; history: History }>("/api/prices/learn", { json: {} });
      setPrices(r.prices);
      setHistory(r.history);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLearning(false);
    }
  }

  return (
    <>
      <PageHeader title="Price book" description={`Starts with demo prices. Learn from your past PayPal invoices to use your own, and it keeps learning from the invoices you send from this browser. It's plain code, not AI: when a price is ${FAR_RATIO} times above or below the usual one, it stops the invoice until you've looked. An item needs ${MIN_SAMPLES} invoices first. It also offers an item your PayPal invoices usually have with one you said.`} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant="secondary" icon={<Landmark className="size-4" />} loading={learning} onClick={learn} data-testid="learn-from-paypal">
          Learn from my PayPal invoices
        </Button>
        {history ? (
          <p className="text-sm text-zinc-700" data-testid="learned-from-paypal">
            {history.own ? "Learned from your last" : "Learned from the trade's last"} {history.invoices} PayPal {history.invoices === 1 ? "invoice" : "invoices"} (read with GET /v2/invoicing/invoices). Labor rates come from the jobs you say.{" "}
            <span className="text-zinc-500" data-testid="history-illustrative">The demo trade&apos;s past invoices are illustrative: made-up jobs and customers on PayPal&apos;s sandbox.</span>
          </p>
        ) : null}
      </div>
      {error ? <EmptyState title="Could not load prices" description={error} /> : !prices ? <SkeletonCard /> : (
        <Card>
          <ul className="divide-y divide-zinc-100" data-testid="price-book">
            {prices.map((entry) => (
              <Row key={entry.id} entry={entry} />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
