"use client";

import { useEffect, useState } from "react";
import { CircleAlert, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import type { TakeProblem } from "@/lib/say/take-problem";
import type { Take } from "./take-store";

/** Stands in for the record button while a take is waiting, so a problem never costs the recording. */
export function KeptTake({ take, problem, onRetry, onDiscard }: { take: Take; problem: TakeProblem; onRetry: () => void; onDiscard: () => void }) {
  const [wait, setWait] = useState(problem.waitSeconds ?? 0);

  useEffect(() => {
    if (!problem.waitSeconds) return;
    const until = Date.now() + problem.waitSeconds * 1000;
    const timer = setInterval(() => {
      const left = Math.ceil((until - Date.now()) / 1000);
      setWait(Math.max(0, left));
      if (left <= 0) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [problem]);

  return (
    <div className="space-y-3" data-testid="kept-take">
      <div role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
        <p className="flex items-start gap-2 text-[15px] font-semibold">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <span data-testid="take-problem">{problem.title}</span>
        </p>
        <p className="mt-1 text-sm" data-testid="take-detail">{problem.detail}</p>
      </div>
      <p className="text-sm text-zinc-600">
        For <span className="font-medium text-zinc-900" data-testid="take-customer">{take.customer.name}</span>
      </p>
      {take.heard ? (
        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm leading-relaxed text-zinc-600" data-testid="take-heard">
          <span className="font-medium text-zinc-500">Heard: </span>
          {take.heard.transcript}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {problem.retry ? (
          <Button size="lg" className="flex-1" icon={<RotateCcw className="size-4" />} disabled={wait > 0} onClick={onRetry} data-testid="retry-take">
            {wait > 0 ? `Try again in ${wait}s` : "Try again"}
          </Button>
        ) : null}
        <Button size="lg" variant="secondary" className="flex-1" icon={<Trash2 className="size-4" />} onClick={onDiscard} data-testid="discard-take">
          {problem.retry ? "Delete it, record again" : "Record again"}
        </Button>
      </div>
    </div>
  );
}
