"use client";

import { useMemo, type ReactNode } from "react";
import { AlertTriangle, Plus, Send, Trash2 } from "lucide-react";
import { Button, Card, CardBody, CardHeader, Field, Input, MoneyInput } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { computeTotals, formatCents, formatQuantity, formatRate, lineCents, MAX_QUANTITY_MILLI, MAX_TAX_RATE_MILLI, MAX_UNIT_CENTS, parseDollars, parsePercent, parseQuantity } from "@/lib/say/money";
import { findMissingAmounts, findNumbers, heardFor } from "@/lib/say/spoken";
import type { JobCustomer, JobFlag, JobLine, JobView } from "@/lib/say/types";

export interface EditLine {
  key: string;
  name: string;
  quantity: string;
  price: string;
}

export interface Draft {
  customer: JobCustomer;
  lines: EditLine[];
  taxPercent: string;
  dueDate: string;
}

export function draftFrom(job: JobView): Draft {
  return {
    customer: job.customer,
    lines: job.lines.map((line) => ({ key: line.key, name: line.name, quantity: formatQuantity(line.quantityMilli), price: (line.unitCents / 100).toFixed(2) })),
    taxPercent: formatRate(job.taxRateMilli),
    dueDate: job.dueDate,
  };
}

function parseLine(line: EditLine): (JobLine & { valid: boolean }) {
  const quantityMilli = parseQuantity(line.quantity) ?? 0;
  const unitCents = parseDollars(line.price) ?? 0;
  const valid = line.name.trim().length > 0 && quantityMilli > 0 && quantityMilli <= MAX_QUANTITY_MILLI && unitCents > 0 && unitCents <= MAX_UNIT_CENTS;
  return { key: line.key, name: line.name.trim(), quantityMilli, unitCents, valid };
}

/** The job as the server should receive it, or null while something on the screen isn't valid. */
export function checkedJob(draft: Draft) {
  const lines = draft.lines.map(parseLine);
  const taxRateMilli = parsePercent(draft.taxPercent);
  if (!lines.length || lines.some((l) => !l.valid) || taxRateMilli === null || taxRateMilli > MAX_TAX_RATE_MILLI || !draft.dueDate) return null;
  if (!draft.customer.name.trim() || !draft.customer.email.trim()) return null;
  return { customer: draft.customer, lines: lines.map(({ key, name, quantityMilli, unitCents }) => ({ key, name, quantityMilli, unitCents })), taxRateMilli, dueDate: draft.dueDate };
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

function RowFlag({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p data-testid={testId} className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <span>{children}</span>
    </p>
  );
}

function ItemRow({ line, original, flags, heard, lineTotal, disabled, onChange, onRemove }: {
  line: EditLine;
  original?: JobLine;
  flags: JobFlag[];
  heard: string | null;
  lineTotal: number | null;
  disabled: boolean;
  onChange: (patch: Partial<EditLine>) => void;
  onRemove: () => void;
}) {
  const parsedCents = parseDollars(line.price);
  const changedPrice = original && parsedCents !== null && parsedCents !== original.unitCents;
  const label = line.name || "this item";
  return (
    <li data-testid="invoice-line" className={cn("space-y-2 rounded-xl border p-3", flags.length ? "border-amber-300 bg-amber-50/30" : "border-zinc-200")}>
      <div className="flex items-center gap-2">
        <Input aria-label="Item" value={line.name} disabled={disabled} onChange={(e) => onChange({ name: e.target.value })} data-testid="line-name" className="font-medium" />
        <Button variant="ghost" size="sm" aria-label={`Remove ${label}`} disabled={disabled} onClick={onRemove} icon={<Trash2 className="size-4" />} />
      </div>
      <div className="grid grid-cols-[5rem_1fr_auto] items-center gap-2">
        <Input aria-label={`Quantity for ${label}`} inputMode="decimal" value={line.quantity} disabled={disabled} onChange={(e) => onChange({ quantity: e.target.value })} data-testid="line-quantity" className="font-mono tabular-nums" />
        <MoneyInput aria-label={`Price for ${label}`} value={line.price} disabled={disabled} onChange={(e) => onChange({ price: e.target.value })} data-testid="line-price" />
        <span className="w-24 text-right font-mono text-[15px] font-semibold tabular-nums text-zinc-900" data-testid="line-total">
          {lineTotal === null ? "--" : formatCents(lineTotal)}
        </span>
      </div>
      {heard ? (
        <p className="text-sm text-zinc-600" data-testid="line-heard">
          <span className="font-medium text-zinc-500">Heard: </span>&ldquo;{heard}&rdquo;
        </p>
      ) : !original ? (
        <p className="text-sm text-zinc-500">Added by you.</p>
      ) : (
        <RowFlag testId="line-unheard">{formatCents(original.unitCents)} on {label} wasn&rsquo;t in what you said. Check it.</RowFlag>
      )}
      {changedPrice ? <p className="text-sm font-medium text-emerald-700" data-testid="line-changed">You changed this from {formatCents(original.unitCents)}.</p> : null}
      {flags.map((flag) => (
        <RowFlag key={flag.text} testId="line-flag">
          <strong className="font-semibold">{label}: </strong>
          {flag.text}
        </RowFlag>
      ))}
    </li>
  );
}

export function Confirm({ job, draft, setDraft, sending, busy, onSend }: { job: JobView; draft: Draft; setDraft: (draft: Draft) => void; sending: boolean; busy: boolean; onSend: () => void }) {
  const parsed = draft.lines.map(parseLine);
  const taxRateMilli = parsePercent(draft.taxPercent) ?? 0;
  const totals = computeTotals(parsed, taxRateMilli);
  // A row the person corrected still accounts for what was heard. A row they deleted doesn't.
  const kept = job.lines.filter((line) => draft.lines.some((d) => d.key === line.key));
  const corrected = new Set(kept.flatMap((line) => [line.unitCents, lineCents(line)]));
  const missing = findMissingAmounts(job.transcript, parsed, taxRateMilli).filter((amount) => !corrected.has(amount.cents));
  const checked = checkedJob(draft);
  const jobFlags = job.flags.filter((flag) => !flag.lineKey || !job.lines.some((line) => line.key === flag.lineKey && draft.lines.some((d) => d.key === line.key)));
  const unheard = draft.lines.filter((line) => {
    const original = job.lines.find((l) => l.key === line.key);
    return original && !heardFor(job.transcript, original);
  }).length;
  const toCheck = job.flags.length + missing.length + unheard;

  const updateLine = (key: string, patch: Partial<EditLine>) => setDraft({ ...draft, lines: draft.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)) });

  return (
    <div className="space-y-6">
      {toCheck || jobFlags.length ? (
        <div className="space-y-2" data-testid="flags-panel">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-amber-900">
            <AlertTriangle className="size-5 text-amber-600" /> {toCheck === 1 ? "1 thing to check before you send" : `${toCheck} things to check before you send`}
          </p>
          {missing.map((amount) => (
            <RowFlag key={amount.cents} testId="missing-amount">
              You said <strong className="font-semibold">{formatCents(amount.cents)}</strong> (&ldquo;{amount.excerpt}&rdquo;) but no line item has that amount.
            </RowFlag>
          ))}
          {jobFlags.map((flag) => (
            <RowFlag key={flag.text} testId="job-flag">
              {flag.text}
            </RowFlag>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader title="Line items" description="Every number is yours to change. Totals are worked out by code, not by the AI." />
        <CardBody className="space-y-3">
          <ul className="space-y-3">
            {draft.lines.map((line, i) => {
              const original = job.lines.find((l) => l.key === line.key);
              const row = parsed[i];
              return (
                <ItemRow
                  key={line.key}
                  line={line}
                  original={original}
                  flags={job.flags.filter((flag) => flag.lineKey === line.key)}
                  heard={heardFor(job.transcript, original ?? { quantityMilli: row.quantityMilli, unitCents: row.unitCents })}
                  lineTotal={row.valid ? totals.lines[i].lineCents : null}
                  disabled={sending}
                  onChange={(patch) => updateLine(line.key, patch)}
                  onRemove={() => setDraft({ ...draft, lines: draft.lines.filter((l) => l.key !== line.key) })}
                />
              );
            })}
          </ul>
          <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} disabled={sending} data-testid="add-line" onClick={() => setDraft({ ...draft, lines: [...draft.lines, { key: `new-${Date.now().toString(36)}`, name: "", quantity: "1", price: "" }] })}>
            Add an item
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer" htmlFor="customer-name">
            <Input id="customer-name" value={draft.customer.name} disabled={sending} onChange={(e) => setDraft({ ...draft, customer: { ...draft.customer, name: e.target.value } })} data-testid="customer-name" />
          </Field>
          <Field label="Customer email" htmlFor="customer-email">
            <Input id="customer-email" type="email" value={draft.customer.email} disabled={sending} onChange={(e) => setDraft({ ...draft, customer: { ...draft.customer, email: e.target.value } })} data-testid="customer-email" />
          </Field>
          <Field label="Due date" htmlFor="due-date" hint={job.dueSaid ? "From what you said." : "Nothing said, so 14 days out."}>
            <Input id="due-date" type="date" value={draft.dueDate} disabled={sending} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} data-testid="due-date" />
          </Field>
          <Field label="Sales tax %" htmlFor="tax-rate">
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
          {!sending ? (
            <Button size="lg" className="mt-4 w-full" icon={<Send className="size-4" />} loading={busy} disabled={!checked} onClick={onSend} data-testid="send-invoice">
              Send invoice for {formatCents(totals.totalCents)}
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
