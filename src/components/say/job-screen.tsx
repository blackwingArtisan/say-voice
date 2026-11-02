"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { ApprovalPrompt } from "@/components/agent/approval-prompt";
import { ToolCallTimeline } from "@/components/agent/tool-call-timeline";
import { useKit } from "@/components/kit/kit-provider";
import { useTimeline } from "@/components/kit/use-timeline";
import { PageHeader } from "@/components/shell/app-shell";
import { useToast } from "@/components/toast";
import { Card, CardBody, CardHeader, EmptyState, SkeletonCard } from "@/components/ui";
import type { JobView } from "@/lib/say/types";
import { checkedJob, Confirm, draftFrom, Transcript, type Draft } from "./confirm";
import { Result } from "./result";

function sourceLine(job: JobView): string {
  const reader = job.ai.mocked ? "AI mock" : (job.ai.model ?? "Claude");
  if (job.source === "sample") return `Sample job, recorded earlier. Read by ${reader}.`;
  return `Heard by ${job.speech?.model ?? "speech to text"}. Read by ${reader}.`;
}

export function JobScreen() {
  const { id } = useParams<{ id: string }>();
  const { kitFetch, status } = useKit();
  const { toast } = useToast();
  const { steps } = useTimeline();
  const [job, setJob] = useState<JobView | null>(null);
  const [edited, setEdited] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => kitFetch<JobView>(`/api/jobs/${id}`), [id, kitFetch]);
  const refresh = useCallback(() => load().then(setJob), [load]);

  useEffect(() => {
    load()
      .then(setJob)
      .catch((e: Error) => setLoadError(e.message));
  }, [load]);

  // The invoice goes out in the background once the person approves, so follow it until it stops.
  const waiting = job?.status === "awaiting_approval";
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void refresh().catch(() => undefined), 700);
    return () => clearInterval(timer);
  }, [waiting, refresh]);

  // The approval card sits next to the amount, so the timeline only reports the wait.
  const timelineSteps = useMemo(() => steps.filter((s) => s.channel !== "global" || s.kind === "webhook").map((s) => (s.approval?.state === "pending" ? { ...s, approval: undefined } : s)), [steps]);

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

  const sent = job.status === "sent" && job.invoice;
  return (
    <>
      <PageHeader title={sent ? "Invoice sent" : "Check the invoice"} description={sent ? undefined : "Your words sit beside every number. Nothing goes out until you approve it."} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-6 lg:sticky lg:top-6">
          <Card>
            <CardHeader title="What you said" description={sourceLine(job)} />
            <CardBody>
              <Transcript text={job.transcript} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="What happened" />
            <CardBody>
              <ToolCallTimeline steps={timelineSteps} className="max-h-[360px]" />
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          {job.error ? (
            <p data-testid="job-error" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{job.error}</span>
            </p>
          ) : null}
          {job.approval ? <ApprovalPrompt approvalId={job.approval.id} summary={job.approval.summary} amount={job.approval.amountValue ? { currency_code: "USD", value: job.approval.amountValue } : undefined} onDecided={() => void refresh()} /> : null}
          {sent ? <Result job={job} invoice={job.invoice!} showLink={status?.paypal.mode === "sandbox"} /> : <Confirm job={job} draft={draft} setDraft={setEdited} sending={job.status !== "review"} busy={busy} onSend={send} />}
        </div>
      </div>
    </>
  );
}
