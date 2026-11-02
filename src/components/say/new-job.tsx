"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, UserPlus } from "lucide-react";
import { useKit } from "@/components/kit/kit-provider";
import { PageHeader } from "@/components/shell/app-shell";
import { useToast } from "@/components/toast";
import { Button, Card, CardBody, CardHeader, Field, Input, StatusPill } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { Contact } from "@/lib/say/contacts";
import { localDay } from "@/lib/say/due";
import { computeTotals, formatCents } from "@/lib/say/money";
import type { JobCustomer, JobView } from "@/lib/say/types";
import { Recorder } from "./recorder";

const OTHER = "other";

interface Heard {
  transcript: string;
  mocked: boolean;
  durationSec?: number;
  audioBytes: number;
}

function ContactRow({ selected, onClick, title, subtitle, testId }: { selected: boolean; onClick: () => void; title: string; subtitle: string; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-testid={testId}
      className={cn("w-full rounded-lg border px-3 py-2 text-left transition", selected ? "border-brand bg-brand-50 ring-1 ring-brand" : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50")}
    >
      <span className="block text-sm font-medium text-zinc-900">{title}</span>
      <span className="block truncate text-xs text-zinc-500">{subtitle}</span>
    </button>
  );
}

function JobRow({ job }: { job: JobView }) {
  const total = job.invoice?.totalCents ?? computeTotals(job.lines, job.taxRateMilli).totalCents;
  return (
    <li>
      <Link href={`/jobs/${job.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-zinc-50" data-testid="job-row">
        <span className="min-w-0 truncate font-medium text-zinc-900">{job.customer.name}</span>
        <span className="ml-auto font-mono tabular-nums text-zinc-700">{formatCents(total)}</span>
        {job.invoice ? <StatusPill status={job.invoice.status} /> : <StatusPill status="DRAFT" />}
      </Link>
    </li>
  );
}

export function NewJob() {
  const { kitFetch, status } = useKit();
  const { toast } = useToast();
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [typedName, setTypedName] = useState("");
  const [typedEmail, setTypedEmail] = useState("");
  const [phase, setPhase] = useState<"ready" | "hearing" | "reading">("ready");
  const [heard, setHeard] = useState<string | null>(null);

  useEffect(() => {
    kitFetch<{ contacts: Contact[] }>("/api/contacts")
      .then((r) => setContacts(r.contacts))
      .catch((e: Error) => toast({ title: "Could not load contacts", description: e.message, variant: "error" }));
    kitFetch<{ jobs: JobView[] }>("/api/jobs")
      .then((r) => setJobs(r.jobs))
      .catch(() => undefined);
  }, [kitFetch, toast]);

  const contact = contacts.find((c) => c.id === picked);
  const customer: JobCustomer | null = contact ? { name: contact.name, email: contact.email } : picked === OTHER && typedName.trim() && /.+@.+\..+/.test(typedEmail) ? { name: typedName.trim(), email: typedEmail.trim() } : null;

  function fail(title: string, e: unknown) {
    toast({ title, description: (e as Error).message, variant: "error", durationMs: 7000 });
    setPhase("ready");
    setHeard(null);
  }

  async function readAudio(audio: Blob) {
    if (!customer) return;
    setPhase("hearing");
    try {
      const speech = await kitFetch<Heard>("/api/speech", { method: "POST", body: audio, headers: { "Content-Type": audio.type } });
      setHeard(speech.transcript);
      setPhase("reading");
      const job = await kitFetch<JobView>("/api/jobs", {
        json: { source: "mic", today: localDay(), customer, transcript: speech.transcript, speech: { mocked: speech.mocked, model: speech.mocked ? "Speech mock" : (status?.speech.model ?? ""), durationSec: speech.durationSec } },
      });
      router.push(`/jobs/${job.id}`);
    } catch (e) {
      fail("That recording didn't work", e);
    }
  }

  async function trySample() {
    setPhase("reading");
    try {
      const job = await kitFetch<JobView>("/api/jobs", { json: { source: "sample", today: localDay() } });
      router.push(`/jobs/${job.id}`);
    } catch (e) {
      fail("The sample job didn't start", e);
    }
  }

  const working = phase !== "ready";
  return (
    <>
      <PageHeader title="New job" description="Say what you did before you drive off. You check every number before anything goes to the customer." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="1. Pick the customer" description="Names come from here, never from speech." />
          <CardBody className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              {contacts.map((c) => (
                <ContactRow key={c.id} selected={picked === c.id} onClick={() => setPicked(c.id)} title={c.name} subtitle={c.email} testId={`contact-${c.id}`} />
              ))}
            </div>
            <button type="button" onClick={() => setPicked(OTHER)} aria-pressed={picked === OTHER} data-testid="contact-other" className={cn("flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition", picked === OTHER ? "border-brand bg-brand-50 ring-1 ring-brand" : "border-dashed border-zinc-300 text-zinc-600 hover:bg-zinc-50")}>
              <UserPlus className="size-4" /> Someone else
            </button>
            {picked === OTHER ? (
              <div className="grid gap-3 pt-1 sm:grid-cols-2">
                <Field label="Name" htmlFor="typed-name">
                  <Input id="typed-name" value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="Full name" />
                </Field>
                <Field label="Email" htmlFor="typed-email">
                  <Input id="typed-email" type="email" value={typedEmail} onChange={(e) => setTypedEmail(e.target.value)} placeholder="name@example.com" />
                </Field>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="2. Say the job" description="Hours, parts, prices, tax. Talk it through like you would to the office." />
            <CardBody className="space-y-3">
              {working ? (
                <div className="space-y-3" data-testid="job-progress">
                  <p className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                    <Loader2 className="size-4 animate-spin text-brand" />
                    {phase === "hearing" ? "Listening to your recording..." : "Reading the job..."}
                  </p>
                  {heard ? <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm leading-relaxed text-zinc-600">{heard}</p> : null}
                </div>
              ) : (
                <>
                  <Recorder disabled={!customer} onRecorded={readAudio} onError={(message) => toast({ title: "No recording", description: message, variant: "warning", durationMs: 7000 })} />
                  {!customer ? <p className="text-center text-xs text-zinc-500">Pick the customer first.</p> : null}
                </>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-900">No mic handy?</p>
                <p className="text-sm text-zinc-500">Run a real recorded job through the whole flow.</p>
              </div>
              <Button variant="secondary" icon={<Sparkles className="size-4" />} disabled={working} onClick={trySample} data-testid="try-sample">
                Try a sample job
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>
      {jobs.length ? (
        <Card className="mt-6">
          <CardHeader title="Recent jobs" />
          <ul className="divide-y divide-zinc-100">
            {jobs.slice(0, 8).map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
