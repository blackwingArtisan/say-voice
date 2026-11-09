"use client";

import { useState } from "react";
import { BellRing, ShieldCheck, ShieldX } from "lucide-react";
import { appConfig } from "@/app.config";
import { Button, Card, CardBody, CardHeader, Input, MoneyInput, Select } from "@/components/ui";
import { formatCents, parseDollars } from "@/lib/say/money";
import { figuresWith, ownerLineProblem } from "@/lib/say/reminder-rules";
import { isPaid, type JobView, type OwnerLineKind } from "@/lib/say/types";

export interface OwnerLineAsk {
  kind: OwnerLineKind;
  amount: string;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The agent writes the note. It reaches the customer only through the approval card. */
export function ReminderCard({ job, busy, problem, onAsk }: { job: JobView; busy: boolean; problem?: string | null; onAsk: (ask: string, ownerLine?: OwnerLineAsk) => void }) {
  const [ask, setAsk] = useState("");
  const [lineKind, setLineKind] = useState<OwnerLineKind | "">("");
  const [lineAmount, setLineAmount] = useState("");
  const refused = (job.refusedNotes ?? []).filter((r) => r.runId === job.reminderRunId);
  const reminders = job.reminders ?? [];
  const run = job.reminderRun;
  const paid = isPaid(job.invoice);
  if (paid && !reminders.length) return null;
  const working = busy || run?.state === "working";
  const applied = job.ownerLinesApplied ?? [];
  // The person's own line, checked here the way the server checks it.
  const lineCents = lineKind ? parseDollars(lineAmount.replace(/^\$/, "").trim()) : null;
  const lineProblem = !lineKind || !job.invoice ? null : lineCents === null ? (lineAmount.trim() ? "Enter dollars and cents, like 25 or 25.00." : "Enter an amount.") : ownerLineProblem({ kind: lineKind, cents: lineCents }, job.invoice);
  const lineAfter = lineKind && lineCents !== null && !lineProblem && job.invoice ? figuresWith(job.invoice, { kind: lineKind, cents: lineCents }).dueCents : null;
  return (
    <Card data-testid="reminder-card">
      <CardHeader title="Payment reminder" description={paid ? undefined : "The AI writes it from what PayPal says is owed. Nothing goes out until you approve it."} />
      <CardBody className="space-y-3">
        {applied.map((line) => (
          <p key={line.at} className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200" data-testid="owner-line-applied">
            <ShieldCheck className="size-4 shrink-0 text-emerald-600" />
            {line.kind === "late_fee" ? `Your ${formatCents(line.cents)} late fee is on PayPal's invoice.` : `Your ${formatCents(line.cents)} deposit is recorded on PayPal's invoice.`}
          </p>
        ))}
        {reminders.map((reminder) => (
          <div key={reminder.sentAt} className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-800" data-testid="reminder-sent">
            <p className="text-xs font-medium text-zinc-500">Sent {when(reminder.sentAt)}</p>
            <p className="mt-0.5">{reminder.note}</p>
          </div>
        ))}
        {refused.map((r) => (
          <div key={r.at} className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-inset ring-red-200" data-testid="reminder-refused">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-700">
              <ShieldX className="size-3.5" /> The AI&apos;s note was stopped before you saw it
            </p>
            <p className="mt-1 line-through decoration-red-400">{r.note}</p>
            <p className="mt-1 font-medium" data-testid="reminder-refused-reason">{r.reason}</p>
          </div>
        ))}
        {problem && !working ? (
          <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="reminder-problem">
            Nothing was sent. {problem}
          </p>
        ) : null}
        {run?.state === "nothing_sent" ? (
          <p className="text-sm text-zinc-700" data-testid="reminder-nothing">
            Nothing was sent. {run.reason}
          </p>
        ) : null}
        {paid ? null : job.noReminderBecause ? (
          <p className="text-sm text-zinc-600" data-testid="no-reminder">{job.noReminderBecause}</p>
        ) : (
          <div className="space-y-2">
            <Input value={ask} onChange={(e) => setAsk(e.target.value)} maxLength={200} placeholder="Anything to add? (optional)" aria-label="Anything to add to the reminder" disabled={working} data-testid="reminder-ask" />
            <fieldset className="space-y-2 rounded-lg border border-zinc-200 px-3 py-2.5" data-testid="owner-line">
              <legend className="px-1 text-sm font-medium text-zinc-700">Your own line (optional)</legend>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={lineKind} onChange={(e) => setLineKind(e.target.value as OwnerLineKind | "")} disabled={working} aria-label="Add a late fee or a deposit" className="sm:w-56" data-testid="owner-line-kind">
                  <option value="">No fee or deposit</option>
                  <option value="late_fee">Add a late fee</option>
                  <option value="deposit">A deposit was paid</option>
                </Select>
                {lineKind ? <MoneyInput value={lineAmount} onChange={(e) => setLineAmount(e.target.value)} placeholder="0.00" aria-label={lineKind === "late_fee" ? "Late fee amount" : "Deposit amount"} disabled={working} className="sm:w-36" data-testid="owner-line-amount" /> : null}
              </div>
              {lineProblem ? <p className="text-xs text-red-600" data-testid="owner-line-error">{lineProblem}</p> : null}
              {lineAfter !== null ? (
                <p className="text-xs text-zinc-700" data-testid="owner-line-after">
                  {lineKind === "late_fee" ? `PayPal's invoice gets a ${formatCents(lineCents!)} late fee line before the reminder goes, so ${formatCents(lineAfter)} is due.` : `PayPal records the ${formatCents(lineCents!)} deposit before the reminder goes, so ${formatCents(lineAfter)} is left to pay.`}
                </p>
              ) : null}
              <p className="text-xs text-zinc-500" data-testid="owner-line-why">
                Only you can add a fee or a deposit. Yours goes on PayPal&apos;s invoice first, so the customer is asked for the same amount the note says. If the AI writes one in by itself, code stops that note: PayPal&apos;s invoice wouldn&apos;t show it.
              </p>
            </fieldset>
            <Button size="lg" variant="secondary" className="w-full sm:w-auto" icon={<BellRing className="size-4" />} loading={working} disabled={working || !!job.approval || !!lineProblem} onClick={() => onAsk(ask, lineKind ? { kind: lineKind, amount: lineAmount } : undefined)} data-testid="ask-reminder">
              {reminders.length ? "Draft another reminder" : "Draft a reminder"}
            </Button>
          </div>
        )}
        {paid ? null : (
          // Why a reminder at all: late payment, with its sources. The landing page leads with accuracy instead.
          <ul className="space-y-1.5 border-t border-zinc-100 pt-3 text-xs leading-relaxed text-zinc-500" data-testid="reminder-why">
            {appConfig.landing.latePayment.map((stat) => (
              <li key={stat.figure}>
                <strong className="font-mono font-semibold text-zinc-700">{stat.figure}</strong> {stat.body}{" "}
                <a href={stat.source.href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-zinc-800" data-testid="reminder-why-source">
                  {stat.source.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
