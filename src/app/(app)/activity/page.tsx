"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, RefreshCw, ShieldCheck, ShieldX, Webhook } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { plainAudit } from "@/lib/say/plain-steps";
import { col, DataGrid } from "@/components/data-grid";
import { useKit } from "@/components/kit/kit-provider";
import { PageHeader } from "@/components/shell/app-shell";
import { useToast } from "@/components/toast";
import { LedgerGrid } from "@/components/ledger/ledger-grid";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, StatusPill } from "@/components/ui";
import type { AuditEntry } from "@/lib/agent/audit";
import type { LedgerEntry } from "@/lib/paypal/ledger";
import type { WebhookEventEnvelope } from "@/lib/paypal/types";
import { computeTotals, formatCents } from "@/lib/say/money";
import type { JobView } from "@/lib/say/types";

interface Step {
  entry: AuditEntry;
  text: string;
}

interface JobGroup {
  job: JobView;
  steps: Step[];
}

/** Every agent run a job has had: the send, each reminder, and any note the code refused. */
const runsOf = (job: JobView) => [job.runId, job.reminderRunId, ...(job.reminders ?? []).map((r) => r.runId), ...(job.refusedNotes ?? []).map((r) => r.runId)].filter((id): id is string => !!id);

/** The steps on the record, under the job they belong to, newest job activity first. Steps from other visitors' jobs stay apart. */
function groupByJob(steps: Step[], jobs: JobView[]): { groups: JobGroup[]; others: Step[] } {
  const owner = new Map<string, JobView>();
  for (const job of jobs) for (const run of runsOf(job)) owner.set(run, job);
  const byJob = new Map<string, JobGroup>();
  const others: Step[] = [];
  for (const step of steps) {
    const job = step.entry.runId ? owner.get(step.entry.runId) : undefined;
    if (!job) {
      others.push(step);
      continue;
    }
    const group = byJob.get(job.id) ?? { job, steps: [] };
    group.steps.push(step);
    byJob.set(job.id, group);
  }
  const latest = (g: JobGroup) => g.steps[0]?.entry.ts ?? g.job.createdAt;
  return { groups: [...byJob.values()].sort((a, b) => latest(b).localeCompare(latest(a))), others };
}

const when = (ts: string) => new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ul className="divide-y divide-zinc-100" data-testid="activity-plain">
      {steps.map(({ entry, text }) => (
        <li key={entry.seq} className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:items-baseline sm:gap-3" data-testid="activity-row">
          <span className="shrink-0 tabular-nums text-zinc-500 sm:w-36">{when(entry.ts)}</span>
          <span className="min-w-0 flex-1 break-words text-zinc-800">{text}</span>
        </li>
      ))}
    </ul>
  );
}

function JobCard({ group }: { group: JobGroup }) {
  const { job, steps } = group;
  const total = job.invoice?.totalCents ?? computeTotals(job.lines, job.taxRateMilli).totalCents;
  const status = job.invoice?.status ?? (job.status === "awaiting_approval" ? "PENDING" : "DRAFT");
  return (
    <section className="rounded-xl border border-zinc-200" data-testid="activity-job" data-job={job.id}>
      <Link href={`/jobs/${job.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-t-xl border-b border-zinc-100 bg-zinc-50/70 px-4 py-3 text-sm hover:bg-zinc-100/70" data-testid="activity-job-head">
        <span className="min-w-0 truncate font-semibold text-zinc-900">{job.customer.name}</span>
        {job.example ? <Badge tone="neutral">Sample</Badge> : null}
        {job.invoice?.number ? <span className="text-zinc-500">Invoice {job.invoice.number}</span> : null}
        <span className="ml-auto font-mono tabular-nums text-zinc-900" data-testid="activity-job-amount">
          {formatCents(total)}
        </span>
        <span data-testid="activity-job-status">
          <StatusPill status={status} />
        </span>
      </Link>
      <div className="px-4">
        <StepList steps={steps} />
      </div>
    </section>
  );
}

export default function ActivityPage() {
  const { kitFetch, status } = useKit();
  const { toast } = useToast();
  const [audit, setAudit] = useState<{ entries: AuditEntry[]; integrity: { ok: boolean; count: number; brokenAt?: number } } | null>(null);
  const [events, setEvents] = useState<WebhookEventEnvelope[] | null>(null);
  const [jobs, setJobs] = useState<JobView[] | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[] | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const isMock = status?.paypal.mode === "mock";
  const [details, setDetails] = useState(false);

  const fetchAll = useCallback(async () => {
    const [auditRes, jobsRes, ledgerRes] = await Promise.all([
      kitFetch<NonNullable<typeof audit>>("/api/audit"),
      kitFetch<{ jobs: JobView[]; example: JobView | null }>("/api/jobs"),
      kitFetch<{ entries: LedgerEntry[] }>("/api/paypal/ledger").catch(() => ({ entries: [] as LedgerEntry[] })),
    ]);
    const eventsRes = isMock ? (await kitFetch<{ events: WebhookEventEnvelope[] }>("/api/dev/webhooks")).events.reverse() : null;
    return { auditRes, eventsRes, jobsRes: [...jobsRes.jobs, ...(jobsRes.example ? [jobsRes.example] : [])], ledgerRes: ledgerRes.entries };
  }, [kitFetch, isMock]);

  const load = useCallback(async () => {
    const { auditRes, eventsRes, jobsRes, ledgerRes } = await fetchAll();
    setAudit(auditRes);
    setEvents(eventsRes);
    setJobs(jobsRes);
    setLedger(ledgerRes);
  }, [fetchAll]);

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then(({ auditRes, eventsRes, jobsRes, ledgerRes }) => {
        if (cancelled) return;
        setAudit(auditRes);
        setEvents(eventsRes);
        setJobs(jobsRes);
        setLedger(ledgerRes);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  async function replay(eventId: string) {
    try {
      await kitFetch("/api/dev/webhooks/replay", { json: { eventId } });
      toast({ title: "Webhook replayed", description: eventId, variant: "success" });
    } catch (e) {
      toast({ title: "Replay failed", description: (e as Error).message, variant: "error" });
    }
  }

  const plain = (audit?.entries ?? []).flatMap((entry) => {
    const text = plainAudit(entry);
    return text ? [{ entry, text }] : [];
  }).reverse();
  const { groups, others } = groupByJob(plain, jobs ?? []);

  return (
    <>
      <PageHeader title="Activity" description="Every invoice and reminder, and what you decided. Nothing moves without your approval." actions={<Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={load}>Refresh</Button>} />
      <Card>
        <CardHeader
          title="What happened, job by job"
          description="Each job with its amount and status, newest first. Open one to see it."
          action={audit?.integrity.ok ? <Badge tone="success"><ShieldCheck className="size-3.5" /> Record checked</Badge> : audit ? <Badge tone="danger"><ShieldX className="size-3.5" /> Record changed</Badge> : null}
        />
        <CardBody>
          {!audit || !jobs ? (
            <p className="text-sm text-zinc-500">Reading the record...</p>
          ) : groups.length ? (
            <div className="space-y-4" data-testid="activity-jobs">
              {groups.map((group) => (
                <JobCard key={group.job.id} group={group} />
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing yet" description="Send an invoice from Jobs and each step shows up here, under its job." />
          )}
          {others.length ? (
            <div className="mt-4">
              <button type="button" onClick={() => setShowOthers((o) => !o)} aria-expanded={showOthers} className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600 hover:text-zinc-900" data-testid="activity-others-toggle">
                <ChevronDown className={cn("size-4 transition-transform", showOthers && "rotate-180")} />
                {others.length} more {others.length === 1 ? "step" : "steps"} not tied to your jobs here (other visitors on this shared test site)
              </button>
              {showOthers ? (
                <div className="mt-2 rounded-xl border border-zinc-200 px-4" data-testid="activity-others">
                  <StepList steps={others} />
                </div>
              ) : null}
            </div>
          ) : null}
          <button type="button" onClick={() => setDetails((d) => !d)} aria-expanded={details} className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800" data-testid="details-toggle">
            <ChevronDown className={cn("size-3.5 transition-transform", details && "rotate-180")} />
            {details ? "Hide details" : "Details"}
          </button>
        </CardBody>
      </Card>
      {details ? (
        <div data-testid="technical-details">
      <Card>
        <CardHeader
          title="Audit log"
          description="Every agent tool request, guard decision, approval and result. Hash-chained: editing any line breaks verification."
          action={
            audit ? (
              audit.integrity.ok ? (
                <Badge tone="success"><ShieldCheck className="size-3.5" /> Chain verified · {audit.integrity.count} entries</Badge>
              ) : (
                <Badge tone="danger"><ShieldX className="size-3.5" /> Broken at #{audit.integrity.brokenAt}</Badge>
              )
            ) : null
          }
        />
        <CardBody>
          <DataGrid<AuditEntry>
            rows={audit?.entries}
            getRowId={(r) => String(r.seq)}
            height={420}
            emptyMessage="Nothing yet. Send an invoice from Jobs and every step shows up here."
            columns={[
              col.text<AuditEntry>("seq", "#", { maxWidth: 80 }),
              col.date<AuditEntry>("ts", "Time"),
              col.text<AuditEntry>("action", "Action", { minWidth: 160 }),
              col.text<AuditEntry>("tool", "Tool", { minWidth: 170 }),
              col.money<AuditEntry>("amount"),
              col.text<AuditEntry>("actor", "Actor"),
              col.text<AuditEntry>("reason", "Reason", { minWidth: 240 }),
              col.id<AuditEntry>("hash", "Hash", { valueFormatter: (p) => String(p.value ?? "").slice(0, 12) }),
            ]}
          />
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="PayPal ledger" description="Every PayPal invoice and payment the app has seen, with its PayPal ID and status, as PayPal last reported it." />
        <CardBody>
          <div data-testid="ledger">
            <LedgerGrid entries={ledger} height={360} />
          </div>
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Webhooks" description={isMock ? "Events the mock PayPal emitted. Replay one to re-run your handlers (signature checked)." : "Register /api/paypal/webhooks in your sandbox app and set PAYPAL_WEBHOOK_ID. Received events appear on the timeline."} />
        <CardBody>
          {isMock ? (
            <DataGrid<WebhookEventEnvelope>
              rows={events}
              getRowId={(r) => r.id}
              height={360}
              emptyMessage="No webhook events yet"
              columns={[
                col.date<WebhookEventEnvelope>("create_time", "Time"),
                col.text<WebhookEventEnvelope>("event_type", "Event", { minWidth: 240 }),
                col.text<WebhookEventEnvelope>("summary", "Summary", { minWidth: 240 }),
                col.id<WebhookEventEnvelope>("id", "Event ID"),
                { headerName: "", maxWidth: 110, sortable: false, filter: false, cellRenderer: (p: { data?: WebhookEventEnvelope }) => (p.data ? <Button size="sm" variant="ghost" onClick={() => replay(p.data!.id)}>Replay</Button> : null) },
              ]}
            />
          ) : (
            <EmptyState icon={<Webhook className="size-5" />} title="Sandbox webhooks" description={status?.paypal.webhookConfigured ? "PAYPAL_WEBHOOK_ID is set; verified events show on the timeline." : "PAYPAL_WEBHOOK_ID is not set yet, so incoming webhooks are rejected (503)."} />
          )}
        </CardBody>
      </Card>
        </div>
      ) : null}
    </>
  );
}
