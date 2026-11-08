"use client";

import { useMemo, type ReactNode } from "react";
import { AlertTriangle, ArrowDown, Check as CheckIcon, Plus, Send, Trash2 } from "lucide-react";
import { Button, Card, CardBody, CardHeader, Field, Input, MoneyInput, Textarea } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { isTestAddress, TEST_ADDRESS_RULE } from "@/lib/say/contacts";
import { canSettle, findChecks, openChecks, placesToCheck, type Check } from "@/lib/say/checks";
import { computeTotals, formatCents, formatQuantity, formatRate, MAX_QUANTITY_MILLI, MAX_TAX_RATE_MILLI, MAX_UNIT_CENTS, parseDollars, parsePercent, parseQuantity } from "@/lib/say/money";
import { findNumbers, heardFor } from "@/lib/say/spoken";
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
  const valid = line.name.trim().length > 0 && quantityMilli > 0 && quantityMilli <= MAX_QUANTITY_MILLI && unitCents > 0 && unitCents <= MAX_UNIT_CENTS;
  return { key: line.key, name: line.name.trim(), quantityMilli, unitCents, description: line.description.trim(), taxed: line.taxed, valid };
}

/** The job as the server should receive it, or null while something on the screen isn't valid. */
export function checkedJob(draft: Draft) {
  const lines = draft.lines.map(parseLine);
  const taxRateMilli = parsePercent(draft.taxPercent);
  if (!lines.length || lines.some((l) => !l.valid) || taxRateMilli === null || taxRateMilli > MAX_TAX_RATE_MILLI || !draft.dueDate) return null;
  if (!draft.customer.name.trim() || !draft.customer.email.trim()) return null;
  const details = { summary: draft.details.summary.trim(), site: draft.details.site.trim(), serviceDate: draft.details.serviceDate };
  return { customer: draft.customer, lines: lines.map(({ key, name, quantityMilli, unitCents, description, taxed }) => ({ key, name, quantityMilli, unitCents, description, taxed })), taxRateMilli, details, dueDate: draft.dueDate, acknowledged: draft.acknowledged };
}

/** The transcript with every number marked, so a mishearing stands out against the rows. */
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

/** Tall enough for a thumb, in a van. */
const TAP = "h-11";

function ItemRow({ line, heardLine, checks, open, heard, lineTotal, lineTax, disabled, onChange, onRemove, onSettle, onSettleWords }: {
  line: EditLine;
  heardLine?: JobLine;
  checks: Check[];
  open: boolean;
  heard: string | null;
  lineTotal: number | null;
  lineTax: number;
  disabled: boolean;
  onChange: (patch: Partial<EditLine>) => void;
  onRemove: () => void;
  onSettle: () => void;
  onSettleWords: () => void;
}) {
  const parsedCents = parseDollars(line.price);
  const changedPrice = heardLine && parsedCents !== null && parsedCents !== heardLine.unitCents;
  const label = line.name || "this item";
  const far = checks.find((check) => check.kind === "far");
  const settleable = checks.some((check) => canSettle(check) && check.kind !== "words");
  const applyPrice = (cents: number) => onChange({ price: (cents / 100).toFixed(2) });
  return (
    <li id={`line-${line.key}`} data-testid="invoice-line" className={cn("scroll-mt-20 space-y-2 rounded-xl border p-3", open ? "border-amber-400 bg-amber-50/40" : "border-zinc-200")}>
      <div className="flex items-center gap-2">
        <Input aria-label="Item" value={line.name} disabled={disabled} onChange={(e) => onChange({ name: e.target.value })} data-testid="line-name" className="font-medium" />
        <Button variant="ghost" className="size-11 shrink-0 px-0" aria-label={`Remove ${label}`} disabled={disabled} onClick={onRemove} icon={<Trash2 className="size-4" />} />
      </div>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2">
        <Input aria-label={`Quantity for ${label}`} inputMode="decimal" value={line.quantity} disabled={disabled} onChange={(e) => onChange({ quantity: e.target.value })} data-testid="line-quantity" className="font-mono tabular-nums" />
        <MoneyInput aria-label={`Price for ${label}`} value={line.price} disabled={disabled} onChange={(e) => onChange({ price: e.target.value })} data-testid="line-price" />
        <span className="w-[5.5rem] text-right font-mono text-[15px] font-semibold tabular-nums text-zinc-900" data-testid="line-total">
          {lineTotal === null ? "--" : formatCents(lineTotal)}
        </span>
      </div>
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
      {changedPrice ? <p className="text-sm font-medium text-emerald-700" data-testid="line-changed">You changed this from {formatCents(heardLine.unitCents)}.</p> : null}
      {checks.map((check) =>
        check.kind === "far" ? (
          <RowFlag key={check.id} testId="line-usual" tone="red">
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
      {open && settleable && !disabled ? (
        <div className="flex flex-wrap gap-2">
          {far?.usualCents ? (
            <Button className={cn(TAP, "flex-1")} onClick={() => applyPrice(far.usualCents!)} data-testid="use-usual">
              Use {formatCents(far.usualCents)}
            </Button>
          ) : null}
          {far?.alikeCents ? (
            <Button variant="secondary" className={cn(TAP, "flex-1")} onClick={() => applyPrice(far.alikeCents!)} data-testid="use-alike">
              Use {formatCents(far.alikeCents)}
            </Button>
          ) : null}
          <Button variant="secondary" className={cn(TAP, "flex-1")} icon={<CheckIcon className="size-4" />} onClick={onSettle} data-testid="keep-line">
            {parsedCents ? `Keep ${formatCents(parsedCents)}` : "Looks right"}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function Confirm({ job, draft, setDraft, sending, busy, onSend }: { job: JobView; draft: Draft; setDraft: (draft: Draft) => void; sending: boolean; busy: boolean; onSend: () => void }) {
  const parsed = draft.lines.map(parseLine);
  const taxRateMilli = parsePercent(draft.taxPercent) ?? 0;
  const totals = computeTotals(parsed, taxRateMilli);
  const checked = checkedJob(draft);
  const checks = findChecks({ transcript: job.transcript, heardLines: job.heardLines, flags: job.flags, lines: parsed.filter((line) => line.valid), taxRateMilli, book: job.priceBook, details: draft.details, aiWording: job.aiWording });
  const open = openChecks(checks, draft.acknowledged);
  const toCheck = placesToCheck(open);
  const jobChecks = checks.filter((check) => !check.lineKey);
  const openJobChecks = open.filter((check) => !check.lineKey);

  const updateDetails = (patch: Partial<JobDetails>) => setDraft({ ...draft, details: { ...draft.details, ...patch } });
  const setRate = (rateMilli: number) => setDraft({ ...draft, taxPercent: formatRate(rateMilli) });
  const noTax = (id: string) => setDraft({ ...draft, taxPercent: "0", acknowledged: [...new Set([...draft.acknowledged, id])] });
  const otherRate = () => {
    const input = document.getElementById("tax-rate") as HTMLInputElement | null;
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
    input?.focus();
    input?.select();
  };
  const updateLine = (key: string, patch: Partial<EditLine>) => setDraft({ ...draft, lines: draft.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)) });
  const settle = (ids: string[]) => setDraft({ ...draft, acknowledged: [...new Set([...draft.acknowledged, ...ids])] });
  const addLine = (price = "") => setDraft({ ...draft, lines: [...draft.lines, { key: `new-${Date.now().toString(36)}`, name: "", quantity: "1", price, description: "", taxed: true }] });

  function goToNextCheck() {
    const first = open[0];
    if (!first) return;
    document.getElementById(first.lineKey ? `line-${first.lineKey}` : "flags-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      {toCheck ? (
        <div className="scroll-mt-20 space-y-2" id="flags-panel" data-testid="flags-panel">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-amber-900">
            <AlertTriangle className="size-5 text-amber-600" /> {toCheck === 1 ? "1 thing to check before you send" : `${toCheck} things to check before you send`}
          </p>
          {toCheck > openJobChecks.length ? <p className="text-sm text-amber-900">Look for the marked items below.</p> : null}
          {openJobChecks.map((check) =>
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
      {jobChecks.length > openJobChecks.length ? (
        <p className="text-sm text-zinc-500" data-testid="settled-note">You let {jobChecks.length - openJobChecks.length === 1 ? "1 warning" : `${jobChecks.length - openJobChecks.length} warnings`} stand.</p>
      ) : null}

      <Card>
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
                  heardLine={heardLine}
                  checks={onRow}
                  open={openOnRow.length > 0}
                  heard={heardFor(job.transcript, heardLine ?? { quantityMilli: row.quantityMilli, unitCents: row.unitCents })}
                  lineTotal={row.valid ? totals.lines[i].lineCents : null}
                  lineTax={row.valid ? totals.lines[i].taxCents : 0}
                  disabled={sending}
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
          <p className="text-sm text-zinc-500" data-testid="quantity-note">Read the quantities yourself. The price book only knows prices, so a misheard quantity shows up here and nowhere else.</p>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer" htmlFor="customer-name" hint={job.heardName && job.heardName.toLowerCase() !== draft.customer.name.trim().toLowerCase() ? <span data-testid="heard-name">Speech heard &ldquo;{job.heardName}&rdquo;. The invoice uses the name here, never that one.</span> : undefined}>
            <Input id="customer-name" value={draft.customer.name} disabled={sending} onChange={(e) => setDraft({ ...draft, customer: { ...draft.customer, name: e.target.value } })} data-testid="customer-name" />
          </Field>
          <Field label="Customer email" htmlFor="customer-email" hint={draft.customer.email.includes("@") && !isTestAddress(draft.customer.email) ? <span data-testid="customer-email-note">{TEST_ADDRESS_RULE}</span> : undefined}>
            <Input id="customer-email" type="email" value={draft.customer.email} disabled={sending} onChange={(e) => setDraft({ ...draft, customer: { ...draft.customer, email: e.target.value } })} data-testid="customer-email" />
          </Field>
          <Field label="Due date" htmlFor="due-date" hint={job.dueSaid ? "From what you said." : "Nothing said, so 14 days out."}>
            <Input id="due-date" type="date" value={draft.dueDate} disabled={sending} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} data-testid="due-date" />
          </Field>
          <Field label="Sales tax %" htmlFor="tax-rate" hint="On the lines marked Taxed.">
            <Input id="tax-rate" inputMode="decimal" value={draft.taxPercent} disabled={sending} onChange={(e) => setDraft({ ...draft, taxPercent: e.target.value })} data-testid="tax-rate" className="font-mono tabular-nums" />
          </Field>
        </CardBody>
        <div className="border-t border-zinc-100 px-5 py-4">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between text-zinc-600">
              <dt>Items</dt>
              <dd className="font-mono tabular-nums" data-testid="subtotal">{formatCents(totals.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between text-zinc-600">
              <dt>Tax</dt>
              <dd className="font-mono tabular-nums" data-testid="tax-total">{formatCents(totals.taxCents)}</dd>
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <dt className="text-[15px] font-semibold text-zinc-900">Total</dt>
              <dd className="font-mono text-2xl font-semibold tabular-nums text-zinc-950" data-testid="invoice-total">{formatCents(totals.totalCents)}</dd>
            </div>
          </dl>
        </div>
      </Card>

      {sending ? null : (
        // On a phone this sits under the thumb. On a desktop it follows the totals.
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          {toCheck ? (
            <Button size="lg" variant="dark" className="w-full" icon={<ArrowDown className="size-4" />} onClick={goToNextCheck} data-testid="next-check">
              {toCheck === 1 ? "1 thing to check first" : `${toCheck} things to check first`}
            </Button>
          ) : (
            <Button size="lg" className="w-full" icon={<Send className="size-4" />} loading={busy} disabled={!checked} onClick={onSend} data-testid="send-invoice">
              Send invoice for {formatCents(totals.totalCents)}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
