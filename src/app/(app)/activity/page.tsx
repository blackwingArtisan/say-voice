"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, RefreshCw, ShieldCheck, ShieldX, Webhook } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { plainAudit } from "@/lib/say/plain-steps";
import { col, DataGrid } from "@/components/data-grid";
import { useKit } from "@/components/kit/kit-provider";
import { PageHeader } from "@/components/shell/app-shell";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import type { AuditEntry } from "@/lib/agent/audit";
import type { WebhookEventEnvelope } from "@/lib/paypal/types";

export default function ActivityPage() {
  const { kitFetch, status } = useKit();
  const { toast } = useToast();
  const [audit, setAudit] = useState<{ entries: AuditEntry[]; integrity: { ok: boolean; count: number; brokenAt?: number } } | null>(null);
  const [events, setEvents] = useState<WebhookEventEnvelope[] | null>(null);
  const isMock = status?.paypal.mode === "mock";
  const [details, setDetails] = useState(false);

  const fetchAll = useCallback(async () => {
    const auditRes = await kitFetch<NonNullable<typeof audit>>("/api/audit");
    const eventsRes = isMock ? (await kitFetch<{ events: WebhookEventEnvelope[] }>("/api/dev/webhooks")).events.reverse() : null;
    return { auditRes, eventsRes };
  }, [kitFetch, isMock]);

  const load = useCallback(async () => {
    const { auditRes, eventsRes } = await fetchAll();
    setAudit(auditRes);
    setEvents(eventsRes);
  }, [fetchAll]);

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then(({ auditRes, eventsRes }) => {
        if (cancelled) return;
        setAudit(auditRes);
        setEvents(eventsRes);
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

  return (
    <>
      <PageHeader title="Activity" description="Every invoice and reminder, and what you decided. Nothing moves without your approval." actions={<Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={load}>Refresh</Button>} />
      <Card>
        <CardHeader
          title="What happened"
          description="Newest first."
          action={audit?.integrity.ok ? <Badge tone="success"><ShieldCheck className="size-3.5" /> Record checked</Badge> : audit ? <Badge tone="danger"><ShieldX className="size-3.5" /> Record changed</Badge> : null}
        />
        <CardBody>
          {!audit ? (
            <p className="text-sm text-zinc-500">Reading the record...</p>
          ) : plain.length ? (
            <ul className="divide-y divide-zinc-100" data-testid="activity-plain">
              {plain.map(({ entry, text }) => (
                <li key={entry.seq} className="flex items-baseline gap-3 py-2.5 text-sm" data-testid="activity-row">
                  <span className="w-36 shrink-0 tabular-nums text-zinc-500">{new Date(entry.ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  <span className="min-w-0 flex-1 break-words text-zinc-800">{text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing yet" description="Send an invoice from Jobs and each step shows up here." />
          )}
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
