/**
 * Creates the PayPal invoice and sends it. Runs behind the Guard, which stops at the approval gate
 * before execute() is reached (requireApprovalFor in app.config.ts), so a customer gets nothing
 * until the person approves this exact amount.
 */
import { z } from "zod";
import { defineTool } from "@/lib/agent/tool";
import { centsToValue, computeTotals, formatCents, formatQuantity, formatRate } from "@/lib/say/money";
import { moneyFromMinor, toMinor } from "@/lib/money";
import type { CreateInvoiceRequest } from "@/lib/paypal/types";

export const SEND_JOB_INVOICE = "send_job_invoice";

const Line = z.object({ name: z.string().min(1).max(200), quantityMilli: z.number().int().positive(), unitCents: z.number().int().positive() });

export const SendInvoiceInput = z.object({
  customer_name: z.string().min(1).max(140),
  customer_email: z.string().email(),
  lines: z.array(Line).min(1).max(50),
  tax_rate_milli: z.number().int().min(0),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  total_cents: z.number().int().positive(),
  idempotency_key: z.string().describe("Same key: never invoiced twice"),
});
export type SendInvoiceInput = z.infer<typeof SendInvoiceInput>;

/** Everything else on the invoice is PayPal's default: its own number, and today's date in its time zone. */
export function invoiceRequest(input: SendInvoiceInput): CreateInvoiceRequest {
  const [givenName, ...rest] = input.customer_name.trim().split(/\s+/);
  const tax = input.tax_rate_milli > 0 ? { tax: { name: "Sales tax", percent: formatRate(input.tax_rate_milli) } } : {};
  return {
    detail: { currency_code: "USD", payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: input.due_date } },
    primary_recipients: [{ billing_info: { name: { given_name: givenName, surname: rest.join(" ") || undefined }, email_address: input.customer_email } }],
    items: input.lines.map((line) => ({ name: line.name, quantity: formatQuantity(line.quantityMilli), unit_amount: { currency_code: "USD", value: centsToValue(line.unitCents) }, ...tax })),
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
    const draft = await ctx.paypal.invoicing.create(invoiceRequest(i));
    const drafted = toMinor(draft.amount.value, "USD");
    // PayPal does its own arithmetic. A customer must never see a number the person didn't approve.
    if (drafted !== i.total_cents) throw new Error(`PayPal worked this out as ${formatCents(drafted)}, not the ${formatCents(i.total_cents)} you approved. Nothing was sent.`);
    await ctx.paypal.invoicing.send(draft.id);
    return { invoice_id: draft.id };
  },
});
