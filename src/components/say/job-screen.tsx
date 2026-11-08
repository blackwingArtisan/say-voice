"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { ApprovalPrompt } from "@/components/agent/approval-prompt";
import { useKit } from "@/components/kit/kit-provider";
import { useTimeline } from "@/components/kit/use-timeline";
import { PageHeader } from "@/components/shell/app-shell";
import { useToast } from "@/components/toast";
import { Badge, Card, CardBody, CardHeader, EmptyState, SkeletonCard } from "@/components/ui";
import { isPaid, type JobView } from "@/lib/say/types";
import { checkedJob, Confirm, draftFrom, Transcript, type Draft } from "./confirm";
import { ReminderCard, type OwnerLineAsk } from "./reminder";
import { Result } from "./result";
import { WhatHappened } from "./what-happened";

function sourceLine(job: JobView): string {
  const reader = job.ai.mocked ? "AI mock" : (job.ai.model ?? "Claude");
  if (job.source === "sample" && job.ai.saved) return "Sample job, recorded earlier. Today's AI budget is used up, so this is a saved Claude reading.";
  if (job.source === "sample") return `Sample job, recorded earlier. Read by ${reader}.`;
  return `Heard by ${job.speech?.model ?? "speech to text"}. Read by ${reader}.`;
}

export function JobScreen() {
  const { id } = useParams<{ id: string }>();
  const { kitFetch, status, refreshStatus } = useKit();
  const { toast } = useToast();
  const { steps } = useTimeline();
  const [job, setJob] = useState<JobView | null>(null);
  const [edited, setEdited] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const decision = useRef<HTMLDivElement>(null);
  const reminder = useRef<HTMLDivElement>(null);

  const load = useCallback(() => kitFetch<JobView>(`/api/jobs/${id}`), [id, kitFetch]);
  const refresh = useCallback(() => load().then(setJob), [load]);

  useEffect(() => {
    load()
      .then(setJob)
      .catch((e: Error) => setLoadError(e.message));
  }, [load]);

  // The job was just read, so the sidebar's spend is out of date.
  useEffect(() => void refreshStatus(), [refreshStatus]);

  // The invoice goes out in the background once the person approves, so follow it until it stops.
  // After that, keep an eye out: the customer can pay at any moment.
  const working = job?.status === "awaiting_approval" || job?.reminderRun?.state === "working";
  const unpaid = job?.status === "sent" && !isPaid(job.invoice);
  const pollMs = working ? 700 : unpaid ? 4000 : 0;
  useEffect(() => {
    if (!pollMs) return;
    const timer = setInterval(() => void refresh().catch(() => undefined), pollMs);
    return () => clearInterval(timer);
  }, [pollMs, refresh]);

  // On a phone Send sits at the bottom of a long page, and these appear at the top of it.
  const approvalId = job?.approval?.id;
  const isSent = job?.status === "sent";
  const needsEyes = isSent ? "sent" : (approvalId ?? job?.error);
  useEffect(() => {
    if (needsEyes) decision.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [needsEyes]);

  // A reminder is decided further down. The approval sits on its card, so the person stays on it.
  useEffect(() => {
    if (isSent && approvalId) reminder.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isSent, approvalId]);

  // Webhooks arrive on a channel every job shares, so show only this job's. The approval card sits
  // next to the amount, so the timeline only reports the wait.
  const invoiceId = job?.invoice?.id;
  const timelineSteps = useMemo(() => {
    const ours = (s: (typeof steps)[number]) => s.channel !== "global" || (s.kind === "webhook" && invoiceId !== undefined && JSON.stringify(s.data ?? null).includes(invoiceId));
    return steps.filter(ours).map((s) => (s.approval?.state === "pending" ? { ...s, approval: undefined } : s));
  }, [steps, invoiceId]);

  if (loadError) return <EmptyState title="Job not found" description={loadError} />;
  if (!job) return <SkeletonCard />;

  const draft = edited ?? draftFrom(job);

  async function send() {
    const checked = checkedJob(draft);
    if (!checked) return;
    setBusy(true);
    try {
      setJob(await kitFetch<JobView>(`/api/jobs/${id}/send`, { json: checked }));
    } catch (e) {
      toast({ title: "Could not send", description: (e as Error).message, variant: "error", durationMs: 8000 });
    } finally {
      setBusy(false);
    }
  }

  async function askForReminder(ask: string, ownerLine?: OwnerLineAsk) {
    setBusy(true);
    try {
      setJob(await kitFetch<JobView>(`/api/jobs/${id}/remind`, { json: { ...(ask.trim() ? { ask } : {}), ...(ownerLine ? { ownerLine } : {}) } }));
    } catch (e) {
      toast({ title: "Could not draft a reminder", description: (e as Error).message, variant: "error", durationMs: 8000 });
    } finally {
      setBusy(false);
    }
  }

  async function checkPayment() {
    try {
      setJob(await kitFetch<JobView>(`/api/jobs/${id}/sync`, { json: {} }));
    } catch (e) {
      toast({ title: "Could not reach PayPal", description: (e as Error).message, variant: "error", durationMs: 8000 });
    }
  }

  const sent = job.status === "sent" && job.invoice;
  const approval = job.approval ? <ApprovalPrompt approvalId={job.approval.id} summary={job.approval.summary} reason={job.approval.note} amount={job.approval.amountValue ? { currency_code: "USD", value: job.approval.amountValue } : undefined} onDecided={() => void refresh()} /> : null;
  const title = !sent ? "Check the invoice" : isPaid(job.invoice) ? "Invoice paid" : "Invoice sent";
  return (
    <>
      <PageHeader title={title} description={job.example ? "A sample job: the sample recording, with the misheard price put right, sent through PayPal and paid. Every visitor sees this one." : sent ? undefined : "Your words sit beside every number. Nothing goes out until you approve it."} />
      {job.example ? (
        <p className="-mt-2 mb-4" data-testid="example-badge">
          <Badge tone="neutral">Sample</Badge>
        </p>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* On a phone the items come straight after the words, and the timeline goes to the bottom. */}
        <div className="contents lg:sticky lg:top-6 lg:block lg:space-y-6">
          <Card className="order-1">
            <CardHeader title="What you said" description={sourceLine(job)} />
            <CardBody>
              <Transcript text={job.transcript} />
            </CardBody>
          </Card>
          {/* On a phone the Send bar is fixed to the bottom while the job is in review, so the last card keeps clear of it. */}
          <Card className={!sent && job.status === "review" ? "order-3 mb-24 lg:mb-0" : "order-3"}>
            <CardHeader title="What happened" />
            <CardBody>
              <WhatHappened steps={timelineSteps} />
            </CardBody>
          </Card>
        </div>
        <div ref={decision} className="order-2 min-w-0 scroll-mt-20 space-y-6">
          {job.error ? (
            <p data-testid="job-error" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{job.error}</span>
            </p>
          ) : null}
          {approval && !sent ? approval : null}
          {sent ? <Result job={job} invoice={job.invoice!} showLink={status?.paypal.mode === "sandbox"} onCheck={checkPayment} /> : null}
          {sent ? (
            <div ref={reminder} className="scroll-mt-20 space-y-6">
              {approval}
              <ReminderCard job={job} busy={busy} onAsk={askForReminder} />
            </div>
          ) : null}
          {sent ? null : <Confirm job={job} draft={draft} setDraft={setEdited} sending={job.status !== "review"} busy={busy} onSend={send} />}
        </div>
      </div>
    </>
  );
}
