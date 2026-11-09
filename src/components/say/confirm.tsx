"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AlertTriangle, ArrowDown, Check as CheckIcon, ChevronDown, Plus, Send, Trash2 } from "lucide-react";
import { Button, Card, CardBody, CardHeader, Field, Input, MoneyInput, Textarea } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { isTestAddress, TEST_ADDRESS_RULE } from "@/lib/say/contacts";
import { canSettle, findChecks, openChecks, placesToCheck, type Check } from "@/lib/say/checks";
import { computeTotals, formatCents, formatQuantity, formatRate, parseDollars, parsePercent, parseQuantity } from "@/lib/say/money";
import { inputProblems, priceProblem, quantityProblem, sendBlockedBy, type InputProblem } from "@/lib/say/line-input";
import { learnedDifference, usuallyWith, usuallyWithText, type PriceEntry } from "@/lib/say/price-book";
import { findNumbers, heardFor } from "@/lib/say/spoken";
import { WithReceipts } from "./receipts";
import type { JobCustomer, JobDetails, JobLine, JobView } from "@/lib/say/types";
import { MAX_DESCRIPTION, MAX_SITE, MAX_SUMMARY } from "@/lib/say/wording";

export interface EditLine {
  key: string;
  name: string;
  quantity: string;
  price: string;
  description: string;
  taxed: boolean;
}

export interface Draft {
  customer: JobCustomer;
  lines: EditLine[];
  taxPercent: string;
  details: JobDetails;
  dueDate: string;
  /** Checks the person has looked at and let stand. */
  acknowledged: string[];
}

export function draftFrom(job: JobView): Draft {
  return {
    customer: job.customer,
    lines: job.lines.map((line) => ({ key: line.key, name: line.name, quantity: formatQuantity(line.quantityMilli), price: (line.unitCents / 100).toFixed(2), description: line.description ?? "", taxed: line.taxed !== false })),
    taxPercent: formatRate(job.taxRateMilli),
    details: job.details ?? { summary: "", site: "", serviceDate: "" },
    dueDate: job.dueDate,
    acknowledged: job.acknowledged ?? [],
  };
}

function parseLine(line: EditLine): (JobLine & { valid: boolean }) {
  const quantityMilli = parseQuantity(line.quantity) ?? 0;
  const unitCents = parseDollars(line.price) ?? 0;
  const valid = line.name.trim().length > 0 && !quantityProblem(line.quantity) && !priceProblem(line.price);
  return { key: line.key, name: line.name.trim(), quantityMilli, unitCents, description: line.description.trim(), taxed: line.taxed, valid };
}

/** The job as the server should receive it, or null while something on the screen isn't valid. */
export function checkedJob(draft: Draft) {
  if (inputProblems(draft).length) return null;
  const lines = draft.lines.map(parseLine);
  const taxRateMilli = parsePercent(draft.taxPercent.trim().replace(/%$/, "") || "0") ?? 0;
  const details = { summary: draft.details.summary.trim(), site: draft.details.site.trim(), serviceDate: draft.details.serviceDate };
  return { customer: draft.customer, lines: lines.map(({ key, name, quantityMilli, unitCents, description, taxed }) => ({ key, name, quantityMilli, unitCents, description, taxed })), taxRateMilli, details, dueDate: draft.dueDate, acknowledged: draft.acknowledged };
}

/** The transcript with every number marked, so a wrong number stands out against the rows. */
export function Transcript({ text }: { text: string }) {
  const parts = useMemo(() => {
    const out: ReactNode[] = [];
    let at = 0;
    for (const mention of findNumbers(text)) {
      if (!mention.isAmount && mention.text.toLowerCase() === "one") continue; // "this one" is rarely a number
      out.push(text.slice(at, mention.start));
      out.push(
        <mark key={mention.start} className={cn("rounded px-0.5 font-semibold text-zinc-950", mention.isAmount ? "bg-amber-200" : "bg-zinc-100")}>
          {mention.text}
        </mark>,
      );
      at = mention.end;
    }
    out.push(text.slice(at));
    return out;
  }, [text]);
  return (
    <p className="text-[17px] leading-relaxed text-zinc-800" data-testid="transcript">
      {parts}
    </p>
  );
}

function RowFlag({ children, testId, tone = "amber" }: { children: ReactNode; testId?: string; tone?: "amber" | "red" }) {
  const red = tone === "red";
  return (
    <p data-testid={testId} className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-sm", red ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900")}>
      <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", red ? "text-red-600" : "text-amber-600")} />
      <span>{children}</span>
    </p>
  );
}

/** "Nov 22": the due date in the folded summary. */
const dueLabel = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "not set");

/** Below Tailwind's lg breakpoint the confirm screen is the phone layout: one decision at a time. */
const PHONE_QUERY = "(max-width: 1023.98px)";
function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
export function useIsPhone() {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}

/** Tall enough for a thumb, in a van. */
const TAP = "h-11";

function FieldError({ problem, testId }: { problem?: InputProblem; testId: string }) {
  if (!problem) return null;
  return (
    <p className="text-sm font-medium text-red-700" data-testid={testId} data-line={problem.line}>
      {problem.text}
    </p>
  );
}

const INVALID = "border-red-400 bg-red-50/50 focus:border-red-500 focus:ring-red-100";

function ItemRow({ line, number, problems, heardLine, checks, open, heard, lineTotal, lineTax, disabled, book, phone, onChange, onRemove, onSettle, onSettleWords }: {
  line: EditLine;
  number: number;
  problems: InputProblem[];
  book: PriceEntry[];
  heardLine?: JobLine;
  checks: Check[];
  open: boolean;
  heard: string | null;
  lineTotal: number | null;
  lineTax: number;
  disabled: boolean;
  /** On a phone what was heard and the description stay behind a tap even on a line with a check: the check is the one thing on screen. */
  phone: boolean;
  onChange: (patch: Partial<EditLine>) => void;
  onRemove: () => void;
  onSettle: () => void;
  onSettleWords: () => void;
}) {
  const parsedCents = parseDollars(line.price);
  const changedPrice = heardLine && parsedCents !== null && parsedCents !== heardLine.unitCents;
  const label = line.name || "this item";
  const far = checks.find((check) => check.kind === "far");
  // Day one, no history: both readings of a sound-alike price, and no usual price.
  const alike = checks.find((check) => check.kind === "alike");
  // A count far from the one the trade's PayPal invoices always had.
  const count = checks.find((check) => check.kind === "qty");
  const learnedNote = parsedCents === null ? null : learnedDifference({ name: line.name, unitCents: parsedCents }, book);
  const settleable = checks.some((check) => canSettle(check) && check.kind !== "words");
  const applyPrice = (cents: number) => onChange({ price: (cents / 100).toFixed(2) });
  const problemOn = (field: InputProblem["field"]) => problems.find((p) => p.field === field);
  const bad = problems.length > 0;
  // What was heard, the description and the tax sit behind a tap, unless this line has something to check.
  // On a desktop a line that comes up with a check stays open once it's dealt with, so the fix stays in view.
  const [more, setMore] = useState(bad || (open && !phone));
  const forced = bad || (open && !phone);
  const showMore = more || forced;
  // On a phone an open price-book catch is answered in its card under your words, one at a time, so the row doesn't ask again.
  const asked = (check: Check) => phone && open && (check.kind === "far" || check.kind === "alike" || check.kind === "qty");
  return (
    <li id={`line-${line.key}`} data-testid="invoice-line" data-invalid={bad || undefined} data-open={open || undefined} className={cn("scroll-mt-20 space-y-2 rounded-xl border p-3", bad ? "border-red-300 bg-red-50/30" : open ? "border-amber-400 bg-amber-50/40" : "border-zinc-200")}>
      <div className="flex items-center gap-2">
        <span className="w-5 shrink-0 text-right text-xs max-sm:hidden font-medium tabular-nums text-zinc-400" aria-label={`Line ${number}`}>{number}</span>
        <Input aria-label="Item" aria-invalid={!!problemOn("name")} value={line.name} disabled={disabled} onChange={(e) => onChange({ name: e.target.value })} data-testid="line-name" className={cn("font-medium", problemOn("name") && INVALID)} />
        <Button variant="ghost" className="size-11 shrink-0 px-0" aria-label={`Remove ${label}`} disabled={disabled} onClick={onRemove} icon={<Trash2 className="size-4" />} />
      </div>
      <div className="grid grid-cols-[4rem_auto_minmax(0,9rem)_minmax(5rem,1fr)] items-center gap-2 sm:pl-7">
        <Input aria-label={`Quantity for ${label}`} aria-invalid={!!problemOn("quantity")} inputMode="decimal" value={line.quantity} disabled={disabled} onChange={(e) => onChange({ quantity: e.target.value })} data-testid="line-quantity" className={cn("font-mono tabular-nums", problemOn("quantity") && INVALID)} />
        <span className="text-sm text-zinc-400" aria-hidden>&times;</span>
        <MoneyInput aria-label={`Price for ${label}`} aria-invalid={!!problemOn("price")} value={line.price} disabled={disabled} onChange={(e) => onChange({ price: e.target.value })} data-testid="line-price" className={problemOn("price") ? "[&_input]:border-red-400 [&_input]:bg-red-50/50" : undefined} />
        <span className={cn("text-right font-mono text-[15px] font-semibold tabular-nums", lineTotal === null ? "text-red-700" : "text-zinc-900")} data-testid="line-total">
          {lineTotal === null ? "--" : formatCents(lineTotal)}
        </span>
      </div>
      <FieldError problem={problemOn("name")} testId="line-name-error" />
      <FieldError problem={problemOn("quantity")} testId="line-quantity-error" />
      <FieldError problem={problemOn("price")} testId="line-price-error" />
      {changedPrice ? <p className="text-sm font-medium text-emerald-700" data-testid="line-changed">You changed this from {formatCents(heardLine.unitCents)}.</p> : null}
      {learnedNote && !far ? (
        <p className="text-sm text-sky-800" data-testid="learned-note">
          {learnedNote}
        </p>
      ) : null}
      {checks.filter((check) => !asked(check)).map((check) =>
        check.kind === "far" ? (
          <RowFlag key={check.id} testId="line-usual" tone="red">
            <strong className="font-semibold">{label}: </strong>
            <WithReceipts text={check.text} item={line.name} />
          </RowFlag>
        ) : check.kind === "qty" ? (
          <RowFlag key={check.id} testId="line-usual-qty" tone="red">
            <strong className="font-semibold">{label}: </strong>
            <WithReceipts text={check.text} item={line.name} />
          </RowFlag>
        ) : check.kind === "alike" ? (
          <RowFlag key={check.id} testId="line-alike" tone="red">
            <strong className="font-semibold">{label}: </strong>
            {check.text}
          </RowFlag>
        ) : check.kind === "vague" ? (
          <RowFlag key={check.id} testId="line-vague">
            {check.text}
          </RowFlag>
        ) : check.kind === "words" ? (
          <div key={check.id} className="space-y-2">
            <RowFlag testId="line-words">{check.text}</RowFlag>
            {disabled ? null : (
              <Button variant="secondary" className={cn(TAP, "w-full")} icon={<CheckIcon className="size-4" />} onClick={onSettleWords} data-testid="keep-description">
                Description looks right
              </Button>
            )}
          </div>
        ) : (
          <RowFlag key={check.id} testId={check.kind === "unheard" ? "line-unheard" : "line-flag"}>
            {check.text.toLowerCase().includes(label.toLowerCase()) ? null : <strong className="font-semibold">{label}: </strong>}
            {check.text}
          </RowFlag>
        ),
      )}
      {open && settleable && !disabled && !checks.every((check) => asked(check) || !canSettle(check) || check.kind === "words") ? (
        <div className="flex flex-wrap gap-2">
          {far?.usualCents ? (
            <Button className={cn(TAP, "flex-1")} onClick={() => applyPrice(far.usualCents!)} data-testid="use-usual">
              Use {formatCents(far.usualCents)}
            </Button>
          ) : null}
          {count?.usualQuantityMilli ? (
            <Button className={cn(TAP, "flex-1")} onClick={() => onChange({ quantity: formatQuantity(count.usualQuantityMilli!) })} data-testid="use-usual-qty">
              Make it {formatQuantity(count.usualQuantityMilli)}
            </Button>
          ) : null}
          {(far ?? alike)?.alikeCents ? (
            <Button variant="secondary" className={cn(TAP, "flex-1")} onClick={() => applyPrice((far ?? alike)!.alikeCents!)} data-testid="use-alike">
              Use {formatCents((far ?? alike)!.alikeCents!)}
            </Button>
          ) : null}
          <Button variant="secondary" className={cn(TAP, "flex-1")} icon={<CheckIcon className="size-4" />} onClick={onSettle} data-testid="keep-line">
            {count && !far && !alike ? `Keep ${line.quantity}` : parsedCents ? `Keep ${formatCents(parsedCents)}` : "Looks right"}
          </Button>
        </div>
      ) : null}
      {forced ? null : (
        <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={showMore} className="inline-flex min-h-8 sm:ml-7 items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800" data-testid="line-more">
          <ChevronDown className={cn("size-4 transition-transform", showMore && "rotate-180")} />
          {showMore ? "Less" : "What you said, description, tax"}
        </button>
      )}
      {showMore ? (
        <div className="space-y-2 sm:pl-7" data-testid="line-details">
          <Textarea
            aria-label={`Description for ${label}`}
            placeholder="What this covers, for the customer"
            rows={2}
            maxLength={MAX_DESCRIPTION}
            value={line.description}
            disabled={disabled}
            onChange={(e) => onChange({ description: e.target.value })}
            data-testid="line-description"
            className="min-h-0 text-[15px]"
          />
          <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" className="size-5 accent-zinc-900" checked={line.taxed} disabled={disabled} onChange={(e) => onChange({ taxed: e.target.checked })} data-testid="line-taxed" />
            Taxed
            {line.taxed && lineTax ? <span className="font-mono tabular-nums text-zinc-500" data-testid="line-tax">+{formatCents(lineTax)} tax</span> : null}
          </label>
          {heard ? (
            <p className="text-sm text-zinc-600" data-testid="line-heard">
              <span className="font-medium text-zinc-500">Heard: </span>&ldquo;{heard}&rdquo;
            </p>
          ) : !heardLine ? (
            <p className="text-sm text-zinc-500">Added by you.</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** pinSlot: where, on a phone, the total and what is left to check stay pinned at the top. */
export function Confirm({ job, draft, setDraft, sending, busy, onSend, pinSlot }: { job: JobView; draft: Draft; setDraft: (draft: Draft) => void; sending: boolean; busy: boolean; onSend: () => void; pinSlot?: HTMLElement | null }) {
  const parsed = draft.lines.map(parseLine);
  const taxRateMilli = parsePercent(draft.taxPercent.trim().replace(/%$/, "") || "0") ?? 0;
  const totals = computeTotals(parsed, taxRateMilli);
  const checked = checkedJob(draft);
  const problems = inputProblems(draft);
  const lineProblems = problems.filter((p) => p.lineKey);
  // A line that can't be read holds the total: the total on screen is always the sum of the lines on screen.
  const holdTotal = lineProblems.length > 0 || problems.some((p) => p.field === "tax");
  const blockedBy = sendBlockedBy(problems);
  const problemOn = (field: InputProblem["field"]) => problems.find((p) => p.field === field && !p.lineKey)?.text;
  const checks = findChecks({ transcript: job.transcript, heardLines: job.heardLines, flags: job.flags, lines: parsed.filter((line) => line.valid), taxRateMilli, book: job.priceBook, details: draft.details, aiWording: job.aiWording });
  const open = openChecks(checks, draft.acknowledged);
  const toCheck = placesToCheck(open);
  const jobChecks = checks.filter((check) => !check.lineKey);
  const openJobChecks = open.filter((check) => !check.lineKey);
  const catches = open.flatMap((check) => {
    const i = check.kind === "far" || check.kind === "alike" || check.kind === "qty" ? draft.lines.findIndex((line) => line.key === check.lineKey) : -1;
    return i < 0 ? [] : [{ check, line: draft.lines[i], number: i + 1 }];
  });
  const phone = useIsPhone();

  // What the customer reads, the due date and the tax fold into one line until there's a reason to open them, so a
  // two-line job fits one desktop screen.
  const [editDetails, setEditDetails] = useState(false);
  // A due date or tax rate that can't be read opens them too, so "Show me" has a field to go to. Once open they stay open.
  const detailsNeedALook = open.some((check) => check.kind === "tax" || (check.kind === "words" && !check.lineKey)) || problems.some((p) => p.field === "due" || p.field === "tax");
  if (detailsNeedALook && !editDetails) setEditDetails(true);
  const folded = !editDetails && !detailsNeedALook;
  const fold = folded ? "hidden" : "";
  const updateDetails = (patch: Partial<JobDetails>) => setDraft({ ...draft, details: { ...draft.details, ...patch } });
  const setRate = (rateMilli: number) => setDraft({ ...draft, taxPercent: formatRate(rateMilli) });
  const noTax = (id: string) => setDraft({ ...draft, taxPercent: "0", acknowledged: [...new Set([...draft.acknowledged, id])] });
  const otherRate = () => {
    setEditDetails(true);
    const input = document.getElementById("tax-rate") as HTMLInputElement | null;
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
    input?.focus();
    input?.select();
  };
  const updateLine = (key: string, patch: Partial<EditLine>) => setDraft({ ...draft, lines: draft.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)) });
  const settle = (ids: string[]) => setDraft({ ...draft, acknowledged: [...new Set([...draft.acknowledged, ...ids])] });
  const freeKey = () => {
    let n = draft.lines.length + 1;
    while (draft.lines.some((line) => line.key === `new-${n}`)) n++;
    return `new-${n}`;
  };
  const addLine = (price = "", more: Partial<EditLine> = {}) => setDraft({ ...draft, lines: [...draft.lines, { key: freeKey(), name: "", quantity: "1", price, description: "", taxed: true, ...more }] });
  // What the trade's PayPal invoices usually bill with an item on this job, not said this time. It never holds the send.
  const nudges = sending ? [] : usuallyWith(draft.lines.map((line) => line.name), job.priceBook).filter((nudge) => !draft.acknowledged.includes(nudge.id));
  // On a phone one decision is on screen at a time: the price book's catches, then the job's checks, then what usually goes with it.
  // The next one comes up once the first is settled. A desktop shows them all.
  const current = catches[0]?.check.id ?? openJobChecks[0]?.id ?? nudges[0]?.id;
  const shown = (id: string) => !phone || id === current;

  function goToProblem() {
    const first = problems[0];
    if (!first) return;
    const target = first.lineKey ? document.querySelector<HTMLInputElement>(`#line-${first.lineKey} [data-testid=line-${first.field}]`) : document.getElementById(first.field === "tax" ? "tax-rate" : first.field === "due" ? "due-date" : first.field);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus();
  }

  function goToNextCheck() {
    const first = open[0];
    if (!first) return;
    // On a phone the decision on screen is in the panel under your words, whichever row it is about.
    const inPanel = !first.lineKey || (phone && catches.length > 0);
    document.getElementById(inPanel ? "flags-panel" : `line-${first.lineKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // On a phone the total and what's left to check stay pinned at the top, in the job screen's slot.
  const pinned = sending ? null : (
    <div className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/95 px-4 py-2 backdrop-blur" data-testid="pinned-summary">
      <p className="text-sm text-zinc-600">
        Total <span className="ml-1 font-mono text-lg font-semibold tabular-nums text-zinc-950" data-testid="pinned-total">{holdTotal ? "--" : formatCents(totals.totalCents)}</span>
      </p>
      {blockedBy ? (
        <button type="button" onClick={goToProblem} className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-800 ring-1 ring-red-200" data-testid="pinned-checks" data-state="blocked">
          Fix first
        </button>
      ) : toCheck ? (
        <button type="button" onClick={goToNextCheck} className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900 ring-1 ring-amber-300" data-testid="pinned-checks" data-state="open">
          <AlertTriangle className="size-3.5 text-amber-600" /> {toCheck} to check
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200" data-testid="pinned-checks" data-state="clear">
          <CheckIcon className="size-3.5" /> All checked
        </span>
      )}
    </div>
  );

  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      {pinSlot && pinned ? createPortal(pinned, pinSlot) : null}
      {sending ? null : (
        // On a desktop the total heads the column; on a phone it is pinned under the top bar.
        <div className="hidden items-baseline justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-4 lg:flex" data-testid="top-total">
          <p className="text-[15px] font-semibold text-zinc-900">
            Invoice for {draft.customer.name.trim() || "your customer"}
          </p>
          <p className="font-mono text-2xl font-semibold tabular-nums text-zinc-950">{holdTotal ? "--" : formatCents(totals.totalCents)}</p>
        </div>
      )}
      {job.dayOne && !sending ? (
        <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700" data-testid="day-one">
          Day one: no PayPal history yet, so there&apos;s no usual price to hold these against. A price that sounds like another still gets asked about.{" "}
          <Link href="/prices" className="font-medium whitespace-nowrap text-brand-700 underline underline-offset-2" data-testid="day-one-learn">
            Learn from my PayPal invoices
          </Link>
        </p>
      ) : null}
      {problems.length && !sending ? (
        <div className="space-y-2" data-testid="input-problems">
          {problems.map((p) => (
            <RowFlag key={`${p.lineKey ?? ""}${p.field}`} tone="red" testId="input-problem">
              <strong className="font-semibold">{p.line ? `Line ${p.line}: ` : ""}</strong>
              {p.text}
            </RowFlag>
          ))}
        </div>
      ) : null}
      {toCheck ? (
        <div className="scroll-mt-20 space-y-2" id="flags-panel" data-testid="flags-panel">
          {/* On a phone the count is in the pinned bar at the top; the decision itself is the one thing here. */}
          <p className="hidden items-center gap-2 text-[15px] font-semibold text-amber-900 lg:flex">
            <AlertTriangle className="size-5 text-amber-600" /> {toCheck === 1 ? "1 thing to check before you send" : `${toCheck} things to check before you send`}
          </p>
          {toCheck > openJobChecks.length + catches.length && !(phone && current) ? <p className="text-sm text-amber-900" data-testid="look-below">Look for the marked items below.</p> : null}
          {catches.filter(({ check }) => shown(check.id)).map(({ check, line, number }) => {
            const cents = parseDollars(line.price);
            return (
              // On a phone the price book's catch comes up here, right under your words, not a screen further down.
              <div key={check.id} className="space-y-2 lg:hidden" data-testid="catch-card">
                <RowFlag tone="red">
                  <strong className="font-semibold">
                    Line {number}, {line.name || "this item"}:{" "}
                  </strong>
                  <WithReceipts text={check.text} item={line.name} />
                </RowFlag>
                {sending ? null : (
                  <div className="flex gap-2">
                    {check.usualCents ? (
                      <Button className={cn(TAP, "flex-1")} onClick={() => updateLine(line.key, { price: (check.usualCents! / 100).toFixed(2) })} data-testid="catch-use-usual">
                        Use {formatCents(check.usualCents)}
                      </Button>
                    ) : check.kind === "qty" && check.usualQuantityMilli ? (
                      <Button className={cn(TAP, "flex-1")} onClick={() => updateLine(line.key, { quantity: formatQuantity(check.usualQuantityMilli!) })} data-testid="catch-use-usual-qty">
                        Make it {formatQuantity(check.usualQuantityMilli)}
                      </Button>
                    ) : check.kind === "alike" && check.alikeCents ? (
                      <Button className={cn(TAP, "flex-1")} onClick={() => updateLine(line.key, { price: (check.alikeCents! / 100).toFixed(2) })} data-testid="catch-use-alike">
                        Use {formatCents(check.alikeCents)}
                      </Button>
                    ) : null}
                    <Button variant="secondary" className={cn(TAP, "flex-1")} icon={<CheckIcon className="size-4" />} onClick={() => settle(open.filter((c) => c.lineKey === line.key && canSettle(c)).map((c) => c.id))} data-testid="catch-keep">
                      {check.kind === "qty" ? `Keep ${line.quantity}` : cents !== null ? `Keep ${formatCents(cents)}` : "Looks right"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {openJobChecks.filter((check) => shown(check.id)).map((check) =>
            check.kind === "tax" ? (
              <div key={check.id} className="space-y-2" data-testid="tax-check">
                <RowFlag>{check.text}</RowFlag>
                {sending ? null : (
                  <div className="grid grid-cols-2 gap-2">
                    {check.choices?.map((choice) => (
                      <Button key={choice.rateMilli} className={cn(TAP, "h-auto min-h-11 whitespace-normal")} onClick={() => setRate(choice.rateMilli)} data-testid="tax-choice">
                        {choice.label}
                      </Button>
                    ))}
                    <Button variant="secondary" className={TAP} onClick={otherRate} data-testid="tax-other">
                      Other rate
                    </Button>
                    <Button variant="secondary" className={TAP} onClick={() => noTax(check.id)} data-testid="no-tax">
                      No tax
                    </Button>
                  </div>
                )}
              </div>
            ) : check.kind === "missing" ? (
              <div key={check.id} className="space-y-2" data-testid="missing-amount">
                <RowFlag>
                  You said <strong className="font-semibold">{formatCents(check.cents!)}</strong> (&ldquo;{check.excerpt}&rdquo;) but no line item has that amount.
                </RowFlag>
                {sending ? null : (
                  <div className="flex gap-2">
                    <Button className={cn(TAP, "flex-1")} icon={<Plus className="size-4" />} onClick={() => addLine((check.cents! / 100).toFixed(2))} data-testid="add-missing">
                      Add it
                    </Button>
                    <Button variant="secondary" className={cn(TAP, "flex-1")} onClick={() => settle([check.id])} data-testid="not-a-charge">
                      Not a charge
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div key={check.id} className="space-y-2" data-testid="job-flag">
                <RowFlag>{check.text}</RowFlag>
                {sending ? null : (
                  <Button variant="secondary" className={cn(TAP, "w-full")} icon={<CheckIcon className="size-4" />} onClick={() => settle([check.id])} data-testid="settle-flag">
                    Looks right
                  </Button>
                )}
              </div>
            ),
          )}
        </div>
      ) : null}
      {nudges.filter((nudge) => shown(nudge.id)).map((nudge) => (
        <div key={nudge.id} className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3" data-testid="usually-with">
          <p className="flex items-start gap-2 text-[15px] text-sky-950">
            <Plus className="mt-0.5 size-4 shrink-0 text-sky-700" />
            <span data-testid="usually-with-text">{usuallyWithText(nudge)}</span>
          </p>
          <div className="flex gap-2">
            <Button className={cn(TAP, "flex-1")} icon={<Plus className="size-4" />} onClick={() => addLine((nudge.cents / 100).toFixed(2), { name: nudge.name, quantity: formatQuantity(nudge.quantityMilli) })} data-testid="add-usual">
              Add {formatCents(nudge.cents)}
            </Button>
            <Button variant="secondary" className={cn(TAP, "flex-1")} onClick={() => settle([nudge.id])} data-testid="leave-out">
              Leave it out
            </Button>
          </div>
        </div>
      ))}
      {jobChecks.length > openJobChecks.length ? (
        <p className="text-sm text-zinc-500" data-testid="settled-note">You let {jobChecks.length - openJobChecks.length === 1 ? "1 warning" : `${jobChecks.length - openJobChecks.length} warnings`} stand.</p>
      ) : null}

      <Card>
        <CardHeader title="Line items" description="Every number is yours to change. Totals are worked out by code, not by the AI." />
        <CardBody className="space-y-3">
          <ul className="space-y-3">
            {draft.lines.map((line, i) => {
              const heardLine = job.heardLines.find((l) => l.key === line.key);
              const row = parsed[i];
              const onRow = checks.filter((check) => check.lineKey === line.key);
              const openOnRow = onRow.filter((check) => !draft.acknowledged.includes(check.id));
              return (
                <ItemRow
                  key={line.key}
                  line={line}
                  number={i + 1}
                  problems={lineProblems.filter((p) => p.lineKey === line.key)}
                  heardLine={heardLine}
                  // A words note goes once it's kept; the other notes stay on the row as a record of what was let stand.
                  checks={onRow.filter((check) => check.kind !== "words" || openOnRow.includes(check))}
                  open={openOnRow.length > 0}
                  heard={heardFor(job.transcript, heardLine ?? { quantityMilli: row.quantityMilli, unitCents: row.unitCents })}
                  lineTotal={row.valid ? totals.lines[i].lineCents : null}
                  lineTax={row.valid ? totals.lines[i].taxCents : 0}
                  disabled={sending}
                  book={job.priceBook}
                  phone={phone}
                  onChange={(patch) => updateLine(line.key, patch)}
                  onRemove={() => setDraft({ ...draft, lines: draft.lines.filter((l) => l.key !== line.key) })}
                  onSettle={() => settle(openOnRow.filter(canSettle).map((check) => check.id))}
                  onSettleWords={() => settle(openOnRow.filter((check) => check.kind === "words").map((check) => check.id))}
                />
              );
            })}
          </ul>
          <Button variant="secondary" className={TAP} icon={<Plus className="size-4" />} disabled={sending} data-testid="add-line" onClick={() => addLine()}>
            Add an item
          </Button>
          <p className="text-sm text-zinc-500" data-testid="quantity-note">Read the quantities yourself. The price book checks a count only for items your PayPal invoices always had the same number of.</p>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer" htmlFor="customer-name" error={problemOn("customer-name")} hint={job.heardName && job.heardName.toLowerCase() !== draft.customer.name.trim().toLowerCase() ? <span data-testid="heard-name">Speech heard &ldquo;{job.heardName}&rdquo;. The invoice uses the name here, never that one.</span> : undefined}>
            <Input id="customer-name" value={draft.customer.name} disabled={sending} onChange={(e) => setDraft({ ...draft, customer: { ...draft.customer, name: e.target.value } })} data-testid="customer-name" />
          </Field>
          <Field label="Customer email" htmlFor="customer-email" error={problemOn("customer-email") ? <span data-testid="customer-email-error">{problemOn("customer-email")}</span> : undefined} hint={draft.customer.email.includes("@") && !isTestAddress(draft.customer.email) ? <span data-testid="customer-email-note">{TEST_ADDRESS_RULE}</span> : undefined}>
            <Input id="customer-email" type="email" aria-invalid={!!problemOn("customer-email")} className={problemOn("customer-email") ? INVALID : undefined} value={draft.customer.email} disabled={sending} onChange={(e) => setDraft({ ...draft, customer: { ...draft.customer, email: e.target.value } })} data-testid="customer-email" />
          </Field>
          <Field className={fold} label="Due date" htmlFor="due-date" error={problemOn("due")} hint={job.dueSaid ? "From what you said." : "Nothing said, so 14 days out."}>
            <Input id="due-date" type="date" value={draft.dueDate} disabled={sending} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} data-testid="due-date" />
          </Field>
          <Field className={fold} label="Sales tax %" htmlFor="tax-rate" hint="On the lines marked Taxed." error={problemOn("tax") ? <span data-testid="tax-rate-error">{problemOn("tax")}</span> : undefined}>
            <Input id="tax-rate" inputMode="decimal" aria-invalid={!!problemOn("tax")} value={draft.taxPercent} disabled={sending} onChange={(e) => setDraft({ ...draft, taxPercent: e.target.value })} data-testid="tax-rate" className={cn("font-mono tabular-nums", problemOn("tax") && INVALID)} />
          </Field>
        </CardBody>
      </Card>

      {folded ? (
        <Card data-testid="details-summary">
          <CardBody className="flex items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-sm text-zinc-700">
              Due {dueLabel(draft.dueDate)}
              {" · "}
              {taxRateMilli ? `${formatRate(taxRateMilli)}% tax` : "No tax"}
              {" · "}
              <span className="font-medium text-zinc-900" data-testid="details-summary-text">{draft.details.summary.trim() || "No job summary"}</span>
            </p>
            <Button variant="secondary" className={TAP} disabled={sending} onClick={() => setEditDetails(true)} data-testid="edit-details">
              Edit
            </Button>
          </CardBody>
        </Card>
      ) : null}

      <Card className={fold}>
        <CardHeader title="What the customer reads" description="What the job was, where and when. It goes at the top of the PayPal invoice." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Job summary" htmlFor="job-summary" className="sm:col-span-2">
            <Input id="job-summary" maxLength={MAX_SUMMARY} placeholder="What the job was" value={draft.details.summary} disabled={sending} onChange={(e) => updateDetails({ summary: e.target.value })} data-testid="job-summary" />
          </Field>
          <Field label="Job site" htmlFor="job-site">
            <Input id="job-site" maxLength={MAX_SITE} placeholder="Street address" value={draft.details.site} disabled={sending} onChange={(e) => updateDetails({ site: e.target.value })} data-testid="job-site" />
          </Field>
          <Field label="Date of service" htmlFor="service-date" hint={job.details?.serviceDate ? "From what you said." : "Nothing said, so none. Add one if you like."}>
            <Input id="service-date" type="date" value={draft.details.serviceDate} disabled={sending} onChange={(e) => updateDetails({ serviceDate: e.target.value })} data-testid="service-date" />
          </Field>
        </CardBody>
      </Card>

      {/* Items, tax and total, with Send beside them. On a desktop the panel stays at the bottom of the window as you scroll,
          one slim row, so the breakdown is always in view and Send never sits on top of it. */}
      <div className="lg:sticky lg:bottom-4 lg:z-20 lg:flex lg:items-center lg:gap-4 lg:rounded-xl lg:border lg:border-zinc-200 lg:bg-white lg:p-3 lg:pl-5 lg:shadow-[0_8px_30px_-12px_rgba(24,24,27,0.25)]" data-testid="totals-panel">
        <div className="rounded-xl border border-zinc-200 bg-white px-5 py-4 lg:min-w-0 lg:flex-1 lg:rounded-none lg:border-0 lg:p-0" data-testid="totals">
          <dl className="space-y-1 text-sm lg:flex lg:flex-wrap lg:items-baseline lg:gap-x-5 lg:space-y-0">
            <div className="flex justify-between gap-2 text-zinc-600">
              <dt>Items</dt>
              <dd className="font-mono tabular-nums" data-testid="subtotal">{holdTotal ? "--" : formatCents(totals.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between gap-2 text-zinc-600">
              <dt>Tax</dt>
              <dd className="font-mono tabular-nums" data-testid="tax-total">{holdTotal ? "--" : formatCents(totals.taxCents)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 pt-1 lg:pt-0">
              <dt className="text-[15px] font-semibold text-zinc-900">Total</dt>
              <dd className="font-mono text-2xl font-semibold tabular-nums text-zinc-950" data-testid="invoice-total">{holdTotal ? "--" : formatCents(totals.totalCents)}</dd>
            </div>
            {holdTotal ? (
              <p className="pt-1 text-right text-sm text-red-700 lg:basis-full lg:pt-0 lg:text-left" data-testid="total-held">
                {lineProblems.length ? `No total until line ${lineProblems[0].line} has a ${lineProblems[0].field === "name" ? "name" : `valid ${lineProblems[0].field}`}.` : "No total until the tax rate is fixed."}
              </p>
            ) : null}
          </dl>
        </div>
        {sending ? null : (
          // On a phone this sits under the thumb. On a desktop it sits under the breakdown, in the same panel, so it never covers it.
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:static lg:w-80 lg:shrink-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none" data-testid="send-bar">
            {blockedBy ? (
              <div className="space-y-1.5">
                <Button size="lg" className="w-full" icon={<Send className="size-4" />} disabled data-testid="send-invoice">
                  {blockedBy}
                </Button>
                <button type="button" className="w-full text-center text-sm font-medium text-red-700 underline underline-offset-2" onClick={goToProblem} data-testid="go-to-problem">
                  Show me
                </button>
              </div>
            ) : toCheck ? (
              <Button size="lg" variant="dark" className="w-full" icon={<ArrowDown className="size-4" />} onClick={goToNextCheck} data-testid="next-check">
                {phone ? "Show me what to check" : toCheck === 1 ? "1 thing to check first" : `${toCheck} things to check first`}
              </Button>
            ) : (
              <Button size="lg" className="w-full" icon={<Send className="size-4" />} loading={busy} disabled={!checked} onClick={onSend} data-testid="send-invoice">
                Send invoice for {formatCents(totals.totalCents)}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
