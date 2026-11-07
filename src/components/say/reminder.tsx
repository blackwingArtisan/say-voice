"use client";

import { useState } from "react";
import { BellRing, ShieldX } from "lucide-react";
import { Button, Card, CardBody, CardHeader, Input } from "@/components/ui";
import { isPaid, type JobView } from "@/lib/say/types";

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The agent writes the note. It reaches the customer only through the approval card. */
export function ReminderCard({ job, busy, onAsk }: { job: JobView; busy: boolean; onAsk: (ask: string) => void }) {
  const [ask, setAsk] = useState("");
  const refused = (job.refusedNotes ?? []).filter((r) => r.runId === job.reminderRunId);
  const reminders = job.reminders ?? [];
  const run = job.reminderRun;
  const paid = isPaid(job.invoice);
  if (paid && !reminders.length) return null;
  const working = busy || run?.state === "working";
  return (
    <Card data-testid="reminder-card">
      <CardHeader title="Payment reminder" description={paid ? undefined : "The AI writes it from what PayPal says is owed. Nothing goes out until you approve it."} />
      <CardBody className="space-y-3">
        {reminders.map((reminder) => (
          <div key={reminder.sentAt} className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-800" data-testid="reminder-sent">
            <p className="text-xs font-medium text-zinc-500">Sent {when(reminder.sentAt)}</p>
            <p className="mt-0.5">{reminder.note}</p>
          </div>
        ))}
        {refused.map((r) => (
          <div key={r.at} className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-inset ring-red-200" data-testid="reminder-refused">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-700">
              <ShieldX className="size-3.5" /> Refused by code, before any approval card
            </p>
            <p className="mt-1 line-through decoration-red-400">{r.note}</p>
            <p className="mt-1 font-medium" data-testid="reminder-refused-reason">{r.reason}</p>
          </div>
        ))}
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
            <Button size="lg" variant="secondary" className="w-full sm:w-auto" icon={<BellRing className="size-4" />} loading={working} disabled={working || !!job.approval} onClick={() => onAsk(ask)} data-testid="ask-reminder">
              {reminders.length ? "Draft another reminder" : "Draft a reminder"}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
