/**
 * Creates the PayPal invoice and sends it. Runs behind the Guard, which stops at the approval gate
 * before execute() is reached (requireApprovalFor in app.config.ts), so a customer gets nothing
 * until the person approves this exact amount.
 */
import { z } from "zod";
import { appConfig } from "@/app.config";
import { defineTool } from "@/lib/agent/tool";
import { centsToValue, computeTotals, formatCents, formatQuantity, formatRate } from "@/lib/say/money";
import { moneyFromMinor, toMinor } from "@/lib/money";
import { invoiceReplaceBody } from "@/lib/paypal/invoice-body";
import type { CreateInvoiceRequest } from "@/lib/paypal/types";
import { toolkitInvoicing } from "@/lib/say/toolkit-invoicing";
import { MAX_DESCRIPTION, MAX_SITE, MAX_SUMMARY, truncate } from "@/lib/say/wording";

export const SEND_JOB_INVOICE = "send_job_invoice";

const Line = z.object({
  name: z.string().min(1).max(200),
  quantityMilli: z.number().int().positive(),
  unitCents: z.number().int().positive(),
  description: z.string().max(MAX_DESCRIPTION).optional(),
  taxed: z.boolean().optional().describe("False leaves this line out of the tax"),
});

export const SendInvoiceInput = z.object({
  customer_name: z.string().min(1).max(140),
  customer_email: z.string().email(),
  lines: z.array(Line).min(1).max(50),
  tax_rate_milli: z.number().int().min(0),
  job_summary: z.string().max(MAX_SUMMARY).optional(),
  job_site: z.string().max(MAX_SITE).optional(),
  service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("When the work was done, only if it was said"),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  total_cents: z.number().int().positive(),
  kept_checks: z.array(z.string()).optional().describe("Checks the person let stand, kept here for the audit log"),
  idempotency_key: z.string().describe("Same key: never invoiced twice"),
});
export type SendInvoiceInput = z.infer<typeof SendInvoiceInput>;

/** PayPal's limits (Invoicing v2 schema): note 4000 characters, item description 1000. */
export const NOTE_MAX = 4000;
export const ITEM_DESCRIPTION_MAX = 1000;

const serviceDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** What the job was, where and when: the note to the customer, at the top of their invoice and in the email. */
export function invoiceNote(input: Pick<SendInvoiceInput, "job_summary" | "job_site" | "service_date">): string | undefined {
  const parts = [input.job_summary?.trim(), input.job_site?.trim() ? `Job site: ${input.job_site.trim()}` : "", input.service_date ? `Date of service: ${serviceDay(input.service_date)}` : ""].filter(Boolean);
  return parts.length ? truncate(parts.join("\n"), NOTE_MAX) : undefined;
}

/** Everything else on the invoice is PayPal's default: its own number, and today's date in its time zone. */
export function invoiceRequest(input: SendInvoiceInput): CreateInvoiceRequest {
  const [givenName, ...rest] = input.customer_name.trim().split(/\s+/);
  const tax = { name: "Sales tax", percent: formatRate(input.tax_rate_milli) };
  const note = invoiceNote(input);
  return {
    detail: { currency_code: "USD", payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: input.due_date }, ...(note ? { note } : {}) },
    invoicer: { business_name: appConfig.tradeName },
    primary_recipients: [{ billing_info: { name: { given_name: givenName, surname: rest.join(" ") || undefined }, email_address: input.customer_email } }],
    items: input.lines.map((line) => ({
      name: line.name,
      ...(line.description?.trim() ? { description: truncate(line.description.trim(), ITEM_DESCRIPTION_MAX) } : {}),
      quantity: formatQuantity(line.quantityMilli),
      unit_amount: { currency_code: "USD", value: centsToValue(line.unitCents) },
      ...(input.service_date ? { item_date: input.service_date } : {}),
      ...(input.tax_rate_milli > 0 && line.taxed !== false ? { tax } : {}),
    })),
  };
}

export const sendJobInvoice = defineTool({
  name: SEND_JOB_INVOICE,
  description: "Create a PayPal invoice for a checked job and send it to the customer.",
  risk: "money",
  schema: SendInvoiceInput,
  title: (i) => `Send ${i.customer_name} an invoice for ${formatCents(i.total_cents)}`,
  impact: async (i) => ({
    amount: moneyFromMinor(i.total_cents),
    counterparties: [i.customer_email],
    summary: `Send ${i.customer_name} an invoice for ${formatCents(i.total_cents)} at ${i.customer_email}`,
  }),
  execute: async (i, ctx) => {
    if (computeTotals(i.lines, i.tax_rate_milli).totalCents !== i.total_cents) throw new Error("The items don't add up to the approved total, so nothing was sent.");
    const request = invoiceRequest(i);
    const toolkit = toolkitInvoicing(ctx);
    // PayPal's Agent Toolkit drafts it. Its create_invoice has no due date, so the draft gets one by update.
    const id = await toolkit.create(request);
    const draft = await ctx.paypal.invoicing.update(id, invoiceReplaceBody(await ctx.paypal.invoicing.get(id), { detail: { payment_term: request.detail.payment_term } }));
    const drafted = toMinor(draft.amount.value, "USD");
    // PayPal does its own arithmetic. A customer must never see a number the person didn't approve.
    if (drafted !== i.total_cents) {
      const gone = await ctx.paypal.invoicing.delete(id).then(() => true, () => false);
      throw new Error(`PayPal worked this out as ${formatCents(drafted)}, not the ${formatCents(i.total_cents)} you approved. ${gone ? "The draft was deleted, so nothing was sent." : "Nothing was sent."}`);
    }
    await toolkit.send(id);
    return { invoice_id: id };
  },
});
