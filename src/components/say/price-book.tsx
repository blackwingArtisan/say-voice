"use client";

import { useEffect, useState } from "react";
import { useKit } from "@/components/kit/kit-provider";
import { PageHeader } from "@/components/shell/app-shell";
import { Badge, Card, EmptyState, SkeletonCard } from "@/components/ui";
import { formatCents } from "@/lib/say/money";
import { FAR_RATIO, MIN_SAMPLES, usualCents, type PriceEntry } from "@/lib/say/price-book";

function Row({ entry }: { entry: PriceEntry }) {
  const low = Math.min(...entry.samples);
  const high = Math.max(...entry.samples);
  return (
    <li className="flex items-center gap-3 px-5 py-3" data-testid="price-row">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-zinc-900" data-testid="price-name">{entry.name}</p>
        <p className="text-sm text-zinc-500" data-testid="price-count">
          {entry.samples.length === 1 ? "1 invoice" : `${entry.samples.length} invoices`}
          {low === high ? "" : `, ${formatCents(low)} to ${formatCents(high)}`}
        </p>
      </div>
      <Badge tone={entry.source === "seed" ? "neutral" : "brand"}>{entry.source === "seed" ? "Demo start" : "Learned"}</Badge>
      <span className="w-20 text-right font-mono text-[15px] font-semibold tabular-nums text-zinc-900" data-testid="price-usual">{formatCents(usualCents(entry.samples))}</span>
    </li>
  );
}

export function PriceBook() {
  const { kitFetch } = useKit();
  const [prices, setPrices] = useState<PriceEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    kitFetch<{ prices: PriceEntry[] }>("/api/prices")
      .then((r) => setPrices(r.prices))
      .catch((e: Error) => setError(e.message));
  }, [kitFetch]);

  return (
    <>
      <PageHeader title="Price book" description={`Starts with demo prices, then learns from the invoices you send from this browser. It's plain code, not AI: when a price is ${FAR_RATIO} times above or below the usual one, it stops the invoice until you've looked. An item needs ${MIN_SAMPLES} invoices first.`} />
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
