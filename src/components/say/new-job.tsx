"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Mic, Sparkles, UserPlus } from "lucide-react";
import { ApiError, useKit } from "@/components/kit/kit-provider";
import { PageHeader } from "@/components/shell/app-shell";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, StatusPill } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { isTestAddress, TEST_ADDRESS_RULE, type Contact } from "@/lib/say/contacts";
import { localDay } from "@/lib/say/due";
import { isOwed, owedFirst, owedSummary, owedText } from "@/lib/say/owed";
import { computeTotals, formatCents } from "@/lib/say/money";
import { explainSample, explainTake, limitSentence, RESTORED, type Refusal, type TakeProblem } from "@/lib/say/take-problem";
import type { JobCustomer, JobView } from "@/lib/say/types";
import { KeptTake } from "./kept-take";
import { Recorder } from "./recorder";
import { YourBusiness } from "./your-business";
import { clearTake, loadTake, saveTake, type Heard, type Take } from "./take-store";

const OTHER = "other";

/** A failed fetch has no status at all: no signal, usually. */
const refusalFrom = (e: unknown): Refusal => (e instanceof ApiError ? { status: e.status, type: e.body.error?.type, message: e.message, retryAfter: e.body.error?.retry_after_seconds, limit: e.body.error?.limit, per: e.body.error?.per } : { type: "network" });

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
      <Link href={`/jobs/${job.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-zinc-50" data-testid={job.example ? "example-job-row" : "job-row"}>
        <span className="min-w-0 truncate font-medium text-zinc-900">{job.customer.name}</span>
        {job.example ? <Badge tone="neutral">Sample</Badge> : null}
        {isOwed(job) && job.invoice!.dueCents !== total ? <span className="text-xs text-zinc-500" data-testid="job-row-due">{formatCents(job.invoice!.dueCents)} due</span> : null}
        <span className="ml-auto font-mono tabular-nums text-zinc-700">{formatCents(total)}</span>
        {job.invoice ? <StatusPill status={job.invoice.status} /> : <StatusPill status="DRAFT" />}
      </Link>
    </li>
  );
}

/** The first thing on Jobs once anything is sent: what's still due, as PayPal last said. */
function OwedLine({ owed }: { owed: ReturnType<typeof owedSummary> }) {
  return (
    <a href="#recent-jobs" className={cn("mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl px-5 py-4 transition", owed.invoices ? "bg-zinc-950 text-white hover:bg-zinc-800" : "bg-emerald-50 text-emerald-900")} data-testid="owed">
      <span className="text-2xl font-semibold tracking-tight tabular-nums" data-testid="owed-line">{owedText(owed)}</span>
      <span className={cn("text-sm", owed.invoices ? "text-zinc-300" : "text-emerald-800")}>
        {owed.invoices ? "Still due on the invoices you sent, as PayPal last said." : "Every invoice you sent is paid or closed, as PayPal last said."}
      </span>
    </a>
  );
}

export function NewJob() {
  const { kitFetch, status } = useKit();
  const { toast } = useToast();
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [example, setExample] = useState<JobView | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [typedName, setTypedName] = useState("");
  const [typedEmail, setTypedEmail] = useState("");
  const [phase, setPhase] = useState<"ready" | "hearing" | "reading">("ready");
  const [heard, setHeard] = useState<string | null>(null);
  const [take, setTake] = useState<Take | null>(null);
  // Recorded before a customer was picked: held here until one is.
  const [waiting, setWaiting] = useState<Blob | null>(null);
  const [problem, setProblem] = useState<TakeProblem | null>(null);
  const [sampleWait, setSampleWait] = useState<{ until: number; text: string } | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!sampleWait) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= sampleWait.until) setSampleWait(null);
    }, 250);
    return () => clearInterval(timer);
  }, [sampleWait]);

  // Next keeps this page alive behind the job page, so a finished job has to leave it ready for the next one.
  const onLeave = useRef<(() => void) | null>(null);
  useLayoutEffect(
    () => () => {
      onLeave.current?.();
      onLeave.current = null;
    },
    [],
  );

  // A take that never became a job is still here after a reload or a trip to another page.
  useEffect(() => {
    let current = true;
    void loadTake().then((saved) => {
      if (!current || !saved) return;
      setTake((now) => now ?? saved);
      setProblem((now) => now ?? RESTORED);
    });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    kitFetch<{ contacts: Contact[] }>("/api/contacts")
      .then((r) => setContacts(r.contacts))
      .catch((e: Error) => toast({ title: "Could not load contacts", description: e.message, variant: "error" }));
    kitFetch<{ jobs: JobView[]; example: JobView | null }>("/api/jobs")
      .then((r) => {
        setJobs(r.jobs);
        setExample(r.example);
      })
      .catch(() => undefined);
  }, [kitFetch, toast]);

  // The recorder comes first. A take recorded before the customer is picked waits for one, then reads.
  const recorder = useRef<HTMLDivElement>(null);
  const customers = useRef<HTMLDivElement>(null);
  function pick(id: string) {
    setPicked(id);
    const chosen = contacts.find((c) => c.id === id);
    if (waiting && chosen) {
      recorder.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      readWaiting({ name: chosen.name, email: chosen.email });
    }
  }

  const contact = contacts.find((c) => c.id === picked);
  const customer: JobCustomer | null = contact ? { name: contact.name, email: contact.email } : picked === OTHER && typedName.trim() && /.+@.+\..+/.test(typedEmail) ? { name: typedName.trim(), email: typedEmail.trim() } : null;

  function readWaiting(to: JobCustomer) {
    if (!waiting) return;
    const recorded = { audio: waiting, customer: to };
    setWaiting(null);
    setTake(recorded);
    void saveTake(recorded);
    void readTake(recorded);
  }

  async function readTake(start: Take) {
    let current = start;
    setProblem(null);
    setPhase(current.heard ? "reading" : "hearing");
    setHeard(current.heard?.transcript ?? null);
    try {
      if (!current.heard) {
        const speech = await kitFetch<Heard>("/api/speech", { method: "POST", body: current.audio, headers: { "Content-Type": current.audio.type } });
        current = { ...current, heard: speech };
        setTake(current);
        void saveTake(current);
        setHeard(speech.transcript);
        setPhase("reading");
      }
      const speech = current.heard!;
      const job = await kitFetch<JobView>("/api/jobs", {
        json: { source: "mic", today: localDay(), customer: current.customer, transcript: speech.transcript, heardAt: speech.heardAt, speech: { mocked: speech.mocked, model: speech.mocked ? "Speech mock" : (status?.speech.model ?? ""), durationSec: speech.durationSec } },
      });
      void clearTake();
      onLeave.current = () => {
        setPhase("ready");
        setHeard(null);
        setTake(null);
        setPicked(null);
        setWaiting(null);
        setTypedName("");
        setTypedEmail("");
      };
      router.push(`/jobs/${job.id}`);
    } catch (e) {
      setProblem(explainTake(refusalFrom(e)));
      setPhase("ready");
      setHeard(null);
    }
  }

  function readAudio(audio: Blob) {
    if (!customer) {
      setWaiting(audio);
      customers.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    const recorded = { audio, customer };
    setTake(recorded);
    void saveTake(recorded); // before the upload, so nothing that happens to it can lose the take
    void readTake(recorded);
  }

  function discardTake() {
    void clearTake();
    setTake(null);
    setProblem(null);
  }

  async function trySample() {
    setPhase("reading");
    try {
      const job = await kitFetch<JobView>("/api/jobs", { json: { source: "sample", today: localDay() } });
      onLeave.current = () => setPhase("ready");
      router.push(`/jobs/${job.id}`);
    } catch (e) {
      const refusal = refusalFrom(e);
      // Too many tries: the wait stays on screen, counting down, until the button works again.
      if (refusal.type === "rate_limited") setNow(Date.now());
      if (refusal.type === "rate_limited") setSampleWait({ until: Date.now() + (refusal.retryAfter ?? 60) * 1000, text: limitSentence(refusal) });
      else toast({ title: "The sample job didn't start", description: explainSample(refusal), variant: "error", durationMs: 7000 });
      setPhase("ready");
    }
  }

  const working = phase !== "ready";
  const owed = owedSummary(jobs);
  const waitLeft = sampleWait ? Math.max(0, Math.ceil((sampleWait.until - now) / 1000)) : 0;
  return (
    <>
      {owed.sent ? <OwedLine owed={owed} /> : null}
      <PageHeader title="New job" description="Say what you did before you drive off. You check every number before it goes." />
      {/* On a phone: record, then who it's for, then the sample. On a desktop the customers sit beside the recorder. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="contents lg:block lg:space-y-6">
          <Card ref={recorder} className="order-1" data-testid="record-card">
            <CardHeader title="Say the job" description="Hours, parts, prices, tax. Talk it through like you would to the office." />
            <CardBody className="space-y-3">
              {working ? (
                <div className="space-y-3" data-testid="job-progress">
                  <p className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                    <Loader2 className="size-4 animate-spin text-brand" />
                    {phase === "hearing" ? "Listening to your recording..." : "Reading the job..."}
                  </p>
                  {heard ? <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm leading-relaxed text-zinc-600">{heard}</p> : null}
                </div>
              ) : take && problem ? (
                <KeptTake take={take} problem={problem} onRetry={() => void readTake(take)} onDiscard={discardTake} />
              ) : waiting ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800" data-testid="take-waiting">
                  <span>Recorded. Pick who it&apos;s for and it reads the job.</span>
                  <button type="button" onClick={() => setWaiting(null)} className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900" data-testid="discard-waiting">
                    Record again
                  </button>
                </div>
              ) : (
                <>
                  <Recorder onRecorded={readAudio} onError={(message) => toast({ title: "No recording", description: message, variant: "warning", durationMs: 7000 })} />
                  <p className="text-center text-xs text-zinc-500" data-testid="record-for">
                    {customer ? <>For <span className="font-medium text-zinc-800">{customer.name}</span></> : "Pick the customer before or after."}
                  </p>
                </>
              )}
            </CardBody>
          </Card>
          <Card className="order-3">
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-900">No mic handy?</p>
                <p className="text-sm text-zinc-500">Run a real recorded job through the whole flow.</p>
              </div>
              <Button variant="secondary" icon={<Sparkles className="size-4" />} disabled={working || waitLeft > 0} onClick={trySample} data-testid="try-sample">
                {waitLeft > 0 ? `Try again in ${waitLeft}s` : "Try a sample job"}
              </Button>
              {waitLeft > 0 ? (
                <p role="status" className="w-full rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="sample-wait">
                  {sampleWait!.text} Try again in <span className="font-mono tabular-nums" data-testid="sample-wait-seconds">{waitLeft}</span> {waitLeft === 1 ? "second" : "seconds"}.
                </p>
              ) : null}
            </CardBody>
          </Card>
        </div>
        <Card ref={customers} className={cn("order-2", waiting && "ring-2 ring-brand")}>
          <CardHeader title={waiting ? "Who was that for?" : "Who's it for?"} description={waiting ? "Pick the customer and it reads the job." : "Names come from here, never from speech."} />
          <CardBody className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              {contacts.map((c) => (
                <ContactRow key={c.id} selected={picked === c.id} onClick={() => pick(c.id)} title={c.name} subtitle={c.email} testId={`contact-${c.id}`} />
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
                <Field label="Email" htmlFor="typed-email" hint={customer && !isTestAddress(customer.email) ? <span data-testid="typed-email-note">{TEST_ADDRESS_RULE} Use something like name@example.com.</span> : undefined}>
                  <Input id="typed-email" type="email" value={typedEmail} onChange={(e) => setTypedEmail(e.target.value)} placeholder="name@example.com" />
                </Field>
              </div>
            ) : null}
            {waiting && customer ? (
              <Button className="w-full" icon={<Mic className="size-4" />} onClick={() => readWaiting(customer)} data-testid="read-waiting">
                Read it for {customer.name}
              </Button>
            ) : null}
          </CardBody>
        </Card>
      </div>
      <YourBusiness
        className="mt-6"
        onContacts={(list, added) => {
          setContacts(list);
          pick(added.id);
        }}
      />
      {jobs.length ? (
        <Card className="mt-6">
          <CardHeader title="Your recent jobs" description={owed.invoices ? "Unpaid first, the oldest at the top." : undefined} />
          <ul className="divide-y divide-zinc-100" id="recent-jobs">
            {owedFirst(jobs).slice(0, 8).map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        </Card>
      ) : null}
      {example ? (
        <Card className="mt-6">
          <CardHeader title="A finished sample job" description="The sample job, sent and paid, so you can see where the flow ends. It's the same for every visitor." />
          <ul className="divide-y divide-zinc-100">
            <JobRow job={example} />
          </ul>
        </Card>
      ) : null}
    </>
  );
}
