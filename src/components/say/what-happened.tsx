"use client";

import { useState } from "react";
import { Check, ChevronDown, CircleDot, Clock, Loader2, X } from "lucide-react";
import { ToolCallTimeline } from "@/components/agent/tool-call-timeline";
import { cn } from "@/components/ui/cn";
import type { TimelineStep } from "@/lib/events/types";
import { plainSteps, type PlainTone } from "@/lib/say/plain-steps";

const ICON: Record<PlainTone, { icon: typeof Check; className: string }> = {
  done: { icon: Check, className: "bg-emerald-50 text-emerald-600 ring-emerald-200" },
  working: { icon: Loader2, className: "bg-sky-50 text-sky-600 ring-sky-200" },
  waiting: { icon: Clock, className: "bg-amber-50 text-amber-600 ring-amber-300" },
  stopped: { icon: X, className: "bg-red-50 text-red-600 ring-red-200" },
  note: { icon: CircleDot, className: "bg-zinc-50 text-zinc-500 ring-zinc-200" },
};

const time = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * What happened, in plain words. The calls behind it (PayPal's endpoints, HTTP status,
 * debug ids, the guard's rules, the AI's cost) sit behind one Details toggle.
 */
export function WhatHappened({ steps }: { steps: TimelineStep[] }) {
  const [details, setDetails] = useState(false);
  const plain = plainSteps(steps);
  return (
    <div className="space-y-3" data-testid="what-happened">
      {plain.length ? (
        <ol className="space-y-2" data-testid="plain-steps">
          {plain.map((step) => {
            const { icon: Icon, className } = ICON[step.tone];
            return (
              <li key={step.id} className="flex items-start gap-2.5 text-sm text-zinc-800" data-testid="plain-step" data-tone={step.tone}>
                <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ring-1", className)}>
                  <Icon className={cn("size-3", step.tone === "working" && "animate-spin")} />
                </span>
                <span className="min-w-0 flex-1 break-words">{step.text}</span>
                <span className="shrink-0 text-xs tabular-nums text-zinc-400">{time(step.at)}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-zinc-500">Each step shows here as it happens.</p>
      )}
      <button type="button" onClick={() => setDetails((d) => !d)} aria-expanded={details} className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800" data-testid="details-toggle">
        <ChevronDown className={cn("size-3.5 transition-transform", details && "rotate-180")} />
        {details ? "Hide details" : "Details"}
      </button>
      {details ? (
        <div className="space-y-2" data-testid="technical-details">
          <p className="text-xs text-zinc-500">The calls behind each step: PayPal&apos;s endpoints with their debug ids, the guard&apos;s decisions, and what each AI call cost.</p>
          <ToolCallTimeline steps={steps} className="max-h-[420px]" />
        </div>
      ) : null}
    </div>
  );
}
