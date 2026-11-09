/** For an unpaid invoice: reads it from PayPal, writes the note, and puts it to the person. */
import { appConfig } from "@/app.config";
import { defineAgent, type ScriptStep } from "@/lib/agent/define";
import { READ_JOB_INVOICE, readJobInvoice, SEND_PAYMENT_REMINDER, sendPaymentReminder } from "./tools/job-reminder";
import { GET_INVOICE, SEARCH_INVOICING, toolkitReads } from "./tools/toolkit-reads";

export const reminderAgent = defineAgent({
  id: "payment-reminder",
  name: "Reminder agent",
  description: "Drafts a payment reminder for an unpaid invoice and sends it only once the person approves.",
  system: `You write payment reminders for a one-person trades business. The customer knows them, so sound like them: short, plain and friendly.

Call ${READ_JOB_INVOICE} first. If can_remind is false, say why_not in one sentence and stop.

Otherwise look the invoice up on PayPal through PayPal's Agent Toolkit: call ${SEARCH_INVOICING} with resource_type "invoice" and invoice_filters.invoice_number set to invoice_number, then ${GET_INVOICE} with the invoice_id it gives back. Its work list says what the job was: you may name the work in a few words, with no prices or quantities. The figures still come from ${READ_JOB_INVOICE}.

Then call ${SEND_PAYMENT_REMINDER} once. The note is one to three short sentences of plain text (no HTML, markdown, lists or emoji) that use the customer's first name, the invoice number and amount_due exactly as given. Say the customer can pay from PayPal's email. If days_past_due is above zero, say it is past due. If reminders_sent is above zero, say this is a follow-up.

If late_fee is set, the person added that late fee and amount_due already includes it: say so in a few words. If deposit_paid is set, thank the customer for that deposit and give amount_due as what's left.

If person_asked is set, the person who did the job wants that in the note: say it to the customer as one plain sentence (not as an instruction), keeping any figures and names exactly as written. You write; code decides what may go. It checks every note against PayPal's invoice and tells you what can't.

Otherwise don't write links, discounts, late fees, deposits, interest, threats, deadlines, or anything else the tool result didn't tell you.

If the tool refuses the note, fix what it names and call it once more. When it refuses a figure, leave that figure and what it was for out of the note entirely; never restate it in words. If the person declines, stop: don't offer another note. Finish with one short sentence saying what happened.`,
  tools: () => [readJobInvoice, ...toolkitReads(), sendPaymentReminder],
  policy: appConfig.agentPolicy,
  effort: "low",
  maxTurns: 7,
  mockScript: (input) => {
    const job_id = input.context?.job_id as string;
    const ask = (input.context?.ask as string | undefined)?.trim();
    // Does what the person asked, as the model does. Code refuses a figure PayPal's invoice doesn't have, so the second try leaves it out.
    // The person's own late fee or deposit, as the model is told to say it.
    const own = (invoice: Record<string, unknown>) =>
      invoice.late_fee ? ` That includes the ${invoice.late_fee} late fee.` : invoice.deposit_paid ? ` Thanks for the ${invoice.deposit_paid} deposit; that's what's left.` : "";
    const asked: ScriptStep[] = ask
      ? [{ tool: SEND_PAYMENT_REMINDER, input: ({ invoice }) => ({ job_id, note: `Hi ${invoice.customer_first_name}, invoice ${invoice.invoice_number} for ${invoice.amount_due} is still open.${own(invoice)} ${ask.replace(/^add (an? )?/i, "There is also a ").replace(/\.?$/, ".")}` }) }]
      : [];
    return [
      { tool: READ_JOB_INVOICE, input: { job_id }, as: "invoice" },
      // The model is told to check PayPal's own record through the toolkit before it writes.
      { tool: SEARCH_INVOICING, input: ({ invoice }) => ({ resource_type: "invoice", invoice_filters: { invoice_number: invoice.invoice_number } }), as: "found" },
      { tool: GET_INVOICE, input: ({ found }) => ({ invoice_id: (found.invoices as { invoice_id: string }[])[0]?.invoice_id }), as: "paypal" },
      ...asked,
      {
        tool: SEND_PAYMENT_REMINDER,
        input: ({ invoice }) => ({ job_id, note: `Hi ${invoice.customer_first_name}, a friendly reminder that invoice ${invoice.invoice_number} for ${invoice.amount_due} is still open.${own(invoice)} You can pay it from PayPal's email. Thanks!` }),
      },
    ];
  },
});
