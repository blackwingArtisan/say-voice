"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "../ui/cn";
import { ModeBadges } from "./mode-badges";

/**
 * The machinery a judge may want and a tradesperson doesn't: which PayPal, which models, today's AI spend.
 * Folded by default; the calls themselves (endpoints, debug ids) sit under Details on each job and on Activity.
 */
export function ForJudges({ className, vertical }: { className?: string; vertical?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("text-xs", className)} data-testid="for-judges" data-open={open || undefined}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex min-h-8 items-center gap-1 font-medium text-zinc-400 hover:text-zinc-700" data-testid="for-judges-toggle">
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        For judges
      </button>
      {open ? (
        <div className="mt-2 space-y-3">
          <ModeBadges vertical={vertical} />
          <p className="text-[11px] leading-relaxed text-zinc-500">Sandbox only. No live PayPal calls are possible from this app. Each job&apos;s Details, and Activity, show the PayPal calls with their debug ids.</p>
        </div>
      ) : null}
    </div>
  );
}
